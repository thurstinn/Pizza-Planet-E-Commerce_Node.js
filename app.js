const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/user');
const Order = require('./models/order');
const Menu = require('./models/menu');
const rateLimit = require('express-rate-limit');
const passwordValidator = require('password-validator');
const app = express();
require('dotenv').config();
const port = 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_STRING, {
    //useNewUrlParser: true,
    //useUnifiedTopology: true,
  }).then(() => {
    console.log('Connected to MongoDB');
  }).catch(err => {
    console.error('MongoDB connection error:', err);
  });

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public')); // For static files
app.use(bodyParser.json());

// Set up session
app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_STRING }),
  cookie: {
    httpOnly: true, // Prevent JavaScript access to cookies
    secure: process.env.NODE_ENV === 'production', // Set secure to true in production (with HTTPS)
    maxAge: 30 * 60 * 1000 // Set session to expire in 30 minutes
  }
}));

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Check if user is logged in
function checkLogin(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Initialize cart if not already
function initCart(req) {
  if (!req.session.cart) {
    req.session.cart = [];
  }
}

// Home page
app.get('/', (req, res) => {
  const cart = req.session.cart || [];
  res.render('index', { loggedIn: req.session.user, cart, currentPage: 'home' });
});

// About page
app.get('/about', (req, res) => {
  const cart = req.session.cart || [];
  res.render('about', { loggedIn: req.session.user, cart, currentPage: 'about' });
});

// Login/Register page
app.get('/login', (req, res) => {
  res.render('login', { loggedIn: req.session.user, currentPage: 'login' });
});

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 5 login requests per windowMs
  message: "Too many login attempts, please try again later."
});

  app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    try {
      // Find the user by username
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(400).send('User does not exist. Please <a href="/login">register</a>.');
      }
  
      // Check if password is correct
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).send('Invalid password. <a href="/login">Try again</a>.');
      }
  
      // Store user in session, checking if they are an admin
      req.session.user = { _id: user._id, username: user.username, isAdmin: user.isAdmin || false };
  
      // Redirect based on user role
      if (user.isAdmin) {
        return res.redirect('/admin'); // Redirect admin users to the admin panel
      } else {
        return res.redirect('/menu'); // Redirect regular users to the menu
      }
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).send('Internal server error');
    }
  });
  
const schema = new passwordValidator();

// Define the password validation rules
schema
  .is().min(8) // Minimum length 8
  .is().max(100) // Maximum length 100
  .has().uppercase() // Must have at least one uppercase letter
  .has().lowercase() // Must have at least one lowercase letter
  .has().digits() // Must have at least one digit
  .has().symbols(); // Must have at least one symbol


  // Register new user
  app.post('/register', async (req, res) => {
    const { username, password } = req.body;
  
    try {
      // Validate the password
      if (!schema.validate(password)) {
        return res.status(400).send('Password does not meet requirements: 1 upper, 1 lower, 1 digit, 1 symbol, length 8 <a href="/login">Go back</a>.');
      }
      
      // Check if user already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).send('Username already in use. <a href="/login">Go back</a>.');
      }
  
      // Hash the password and create a new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username, password: hashedPassword });
      await newUser.save();
  
      // Log in the newly registered user
      req.session.user = newUser;
      res.redirect('/menu');
    } catch (error) {
      console.error('Error during registration:', error);
      res.status(500).send('Internal server error');
    }
  });
  
  // Log out user
  app.get('/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).send('Internal server error');
      }
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });

// Middleware to check if the user is admin
function checkAdmin(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Admin panel
app.get('/admin', checkAdmin, (req, res) => {
  res.render('admin', { loggedIn: true, currentPage: 'admin' });
});

//Admin Update-Menu page
app.get('/admin/update-menu', checkAdmin, async (req, res) => {
  try {
    const menuItems = await Menu.find({});
    res.render('update-menu', { menuItems, loggedIn: req.session.admin });
  } catch (err) {
    console.error('Error fetching menu items:', err);
    res.status(500).send('Internal server error');
  }
});

// Add new menu item
app.post('/admin/update-menu/add', checkAdmin, async (req, res) => {
  const { name, price } = req.body;

  try {
    const newItem = new Menu({ name, price });
    await newItem.save();
    res.redirect('/admin/update-menu');
  } catch (error) {
    console.error('Error adding new menu item:', error);
    res.status(500).send('Error adding new item');
  }
});

// Remove menu item
app.post('/admin/update-menu/delete', checkAdmin, async (req, res) => {
  const { id } = req.body;

  try {
    await Menu.findByIdAndDelete(id);
    res.redirect('/admin/update-menu');
  } catch (error) {
    console.error('Error removing menu item:', error);
    res.status(500).send('Error removing item');
  }
});

// Admin View-Orders page
app.get('/admin/orders', checkAdmin, async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).populate('items');
    res.render('view-orders', { orders, loggedIn: req.session.admin });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send('Internal server error');
  }
});

// Menu page
app.get('/menu', async (req, res) => {
  try {
    initCart(req); // Ensure cart is initialized
    const cart = req.session.cart || [];
    const pizzas = await Menu.find(); // Fetch menu items from the database
    const added = req.query.added === 'true'; // Check if an item was added
    res.render('menu', { pizzas, cart, added, loggedIn: req.session.user, currentPage: 'menu' });
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).send('Internal server error');
  }
});

// Add to cart
app.post('/add-to-cart', checkLogin, async (req, res) => {
  const { pizzaId } = req.body;
  initCart(req);

  // Find pizza by its MongoDB _id
  const pizza = await Menu.findById(pizzaId);
  if (!pizza) {
    return res.status(404).send('Pizza not found');
  }

  const cartItem = req.session.cart.find(item => item._id.toString() === pizzaId);

  if (cartItem) {
    // If it exists, increase the quantity
    cartItem.quantity += 1;
  } else {
    // If not, add the pizza with a quantity of 1
    req.session.cart.push({ ...pizza.toObject(), quantity: 1 });
  }

  res.redirect('/menu?added=true');
});


// Cart page
app.get('/cart', (req, res) => {
  initCart(req);
  const cart = req.session.cart;
  res.render('cart', { cart, loggedIn: req.session.user, currentPage: 'cart' });
});

// Update Cart
app.post('/update-cart', checkLogin, async (req, res) => {
  const { pizzaId, action } = req.body;

  // Validate pizzaId
  if (!mongoose.Types.ObjectId.isValid(pizzaId)) {
    return res.status(400).send('Invalid pizzaId');
  }

  initCart(req);

  const cart = req.session.cart;
  const pizzaIdObj = new mongoose.Types.ObjectId(pizzaId); // Use new keyword for ObjectId

  // Find pizza in the menu
  const pizza = await Menu.findById(pizzaIdObj).exec();

  if (pizza) {
    const cartItem = cart.find(item => item._id.toString() === pizzaIdObj.toString()); // Convert both to string for comparison

    if (cartItem) {
      if (action === 'plus') {
        cartItem.quantity += 1; // Increase quantity
      } else if (action === 'minus') {
        cartItem.quantity -= 1; // Decrease quantity but not below 1
        if (cartItem.quantity < 1) {
          cartItem.quantity = 1;
        }
      }
    }
  }

  res.redirect('/cart');
});

// Remove from Cart
app.post('/remove-from-cart', checkLogin, (req, res) => {
  const { pizzaId } = req.body;

  // Validate pizzaId
  if (!mongoose.Types.ObjectId.isValid(pizzaId)) {
    return res.status(400).send('Invalid pizzaId');
  }

  initCart(req);

  const cart = req.session.cart;
  const pizzaIdObj = new mongoose.Types.ObjectId(pizzaId); // Use new keyword for ObjectId

  req.session.cart = cart.filter(item => item._id.toString() !== pizzaIdObj.toString()); // Convert both to string for comparison
  res.redirect('/cart');
});


// Checkout with Stripe
app.post('/checkout', checkLogin, async (req, res) => {
  const cart = req.session.cart;
  if (cart.length === 0) {
    // Render checkout page with a message indicating the cart is empty
    return res.render('checkout', {
      cart, 
      loggedIn: req.session.user, 
      currentPage: 'checkout', 
      message: 'Your cart is empty. Please add items to your cart before checking out.'
    });
  }
  const totalAmount = cart.reduce((total, item) => total + (item.price * item.quantity), 0);

  // Create Stripe payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100), // Amount in cents
    currency: 'usd',
    metadata: { integration_check: 'accept_a_payment' }
  });

  // Save order to the database
  const newOrder = new Order({
    user: req.session.user._id,
    items: cart,
    total: totalAmount,
    paymentStatus: 'pending'
  });

  await newOrder.save();

  res.render('checkout', { 
    clientSecret: paymentIntent.client_secret,
    orderId: newOrder._id, // Pass the order ID to update later
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY, // Pass public key
    loggedIn: req.session.user,
    cart: cart, // Pass cart for consistency
    currentPage: 'checkout',
    message: null
  });
});

// Update order status after successful payment
app.get('/success', async (req, res) => {
    const { orderId } = req.query; // Passed through redirect
    await Order.findByIdAndUpdate(orderId, { paymentStatus: 'completed' });
  
    req.session.cart = []; // Clear cart after successful payment
    const cart = req.session.cart;
    res.render('success', { cart, loggedIn: req.session.user, currentPage: 'success' });

  });

// Orders page
app.get('/orders', async (req, res) => {
  try {
    // Fetch the user's orders from the database
    const orders = await Order.find({ user: req.session.user._id }).sort({ createdAt: -1 }).populate('items');
    
    // Initialize the cart if it's not already initialized
    const cart = req.session.cart || [];

    // Render the orders page with orders, cart, and other required variables
    res.render('orders', {
      orders, 
      loggedIn: req.session.user, 
      cart, // Pass the cart to the template
      currentPage: 'orders' // Pass the currentPage for navigation highlighting
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send('Error retrieving orders');
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
