const express = require('express');
const session = require('express-session');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/user');
const Order = require('./models/order');
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
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: true,
}));

// Pizza menu data
const pizzas = [
  { id: 1, name: 'Margherita', price: 12.99 },
  { id: 2, name: 'Pepperoni', price: 14.99 },
  { id: 3, name: 'Veggie', price: 13.99 }
];

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

  app.post('/login', async (req, res) => {
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
  
      // Store user in session
      req.session.user = user;
      res.redirect('/menu');
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).send('Internal server error');
    }
  });
  
  app.post('/register', async (req, res) => {
    const { username, password } = req.body;
  
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).send('Username already in use. <a href="/login">Log in</a>.');
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

// Pizza menu page
app.get('/menu', (req, res) => {
  initCart(req); // Ensure cart is initialized
  const cart = req.session.cart || []; // Default to empty array if cart is not initialized
  const added = req.query.added === 'true'; // Check if an item was added
  res.render('menu', { pizzas, cart, added, loggedIn: req.session.user, currentPage: 'menu' });
});

// Add to cart
app.post('/add-to-cart', checkLogin, (req, res) => {
  const { pizzaId } = req.body;
  const pizza = pizzas.find(p => p.id == pizzaId);
  initCart(req);
  const cartItem = req.session.cart.find(item => item.id == pizzaId);

  if (cartItem) {
    // If it exists, increase the quantity
    cartItem.quantity += 1;
  } else {
    // If not, add the pizza with a quantity of 1
    req.session.cart.push({ ...pizza, quantity: 1 });
  }
  //req.session.cart.push(pizza);
  res.redirect('/menu?added=true');
});

// Cart page
app.get('/cart', (req, res) => {
  initCart(req);
  const cart = req.session.cart;
  res.render('cart', { cart, loggedIn: req.session.user, currentPage: 'cart' });
});

// Update cart (increase or decrease quantity)
app.post('/update-cart', (req, res) => {
  const { pizzaId, action } = req.body;
  initCart(req);

  const cart = req.session.cart;
  const pizza = cart.find(p => p.id == pizzaId);

  if (pizza) {
    if (action === 'plus') {
      pizza.quantity += 1; // Increase quantity
    } else if (action === 'minus') {
      pizza.quantity -= 1; // Decrease quantity but not below 1
      if (pizza.quantity < 1) {
        pizza.quantity = 1;
      }
    }
  }

  //req.session.cart = cart;
  res.redirect('/cart');
});

app.post('/remove-from-cart', (req, res) => {
  const { pizzaId } = req.body;
  const cart = req.session.cart;

  req.session.cart = cart.filter(item => item.id != pizzaId);
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
    const orders = await Order.find({ user: req.session.user._id });
    
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
