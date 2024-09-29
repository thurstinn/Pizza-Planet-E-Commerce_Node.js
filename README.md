# Pizza-Planet-E-Commerce_Node.js
E-Commerce Site using Node.js

* Requires Node.js.
* Requires MongoDB Connection String.
* Requires Stripe Private and Public Test Keys.
    * Place as environment variables in a .env file:
        * STRIPE_PRIVATE_KEY=your-key
        * STRIPE_PUBLIC_KEY=your-key
        * MONGODB_STRING=your-connection-string
    
    * Other environment variables:
        * SESSION_KEY=your-session-secret
        * PORT=3000
        * NODE_ENV=development *Change to 'production' before deploying.

* Install Dependencies:
    * Open comand prompt
    * Navigate to root directory
    * Enter command: npm install

* Seed Database with Initial Menu Items:
    * Enter command: node seedMenu.js

* Start Web App:
    * Enter command: npm start

* To make a (fake) order, first register:
    * Username of your choice
    * Password Requirements:
        * Minimum length 8
        * Maximum length 100
        * Must have at least one uppercase letter
        * Must have at least one lowercase letter
        * Must have at least one digit
        * Must have at least one symbol
* To checkout, enter card#: 4242 4242 4242 4242 
* Expiration: any future date (05/31).
* CVC: any 3 digit number.
* Zip: any 5 digit number.

* Admin:
    * Register a user you want to be admin.
    * In MongoDB Compass, navigate to users folder.
    * Open shell and enter command: 

        ```
        db.users.updateOne(
            { username: "your-username" },
            {
                $set: {
                    isAdmin: true
                }
            }
        );
        ```

    * Now you can login with those credentials to be directed to the Admin Panel.



