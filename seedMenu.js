const mongoose = require('mongoose');
const Menu = require('./models/menu'); // Adjust the path as needed

require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});

// Define menu items
const menuItems = [
  { name: 'Margherita', price: 12.99 },
  { name: 'Pepperoni', price: 14.99 },
  { name: 'Veggie', price: 13.99 }
];

// Seed the database
async function seedDB() {
  try {
    // Delete existing menu items
    await Menu.deleteMany({});

    // Insert new menu items
    await Menu.insertMany(menuItems);
    console.log('Menu items seeded successfully');

    // Close the connection
    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding database:', error);
    mongoose.connection.close();
  }
}

seedDB();
