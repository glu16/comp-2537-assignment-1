require("./utils.js");

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const expireTime = 60 * 60 * 1000; // Expires after 1 hour (minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var { database } = include("databaseConnection");

const userCollection = database.db(mongodb_database).collection("users");

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, // Default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

app.get("/", (req, res) => {
  if (!req.session.authenticated) {
    const buttons = `
      <button onclick="window.location.href='/signup'">Sign up</button>
      <button onclick="window.location.href='/login'">Log in</button>
    `;
    res.send(`<h1>Create an account or log in</h1>${buttons}`);
  } else {
    const buttons = `
      <button onclick="window.location.href='/members'">Go to Members Area</button>
      <button onclick="window.location.href='/logout'">Log out</button>
    `;
    res.send(`<h1>Hello, ${req.session.username}!</h1>${buttons}`);
  }
});

app.get("/nosql-injection", async (req, res) => {
  var username = req.query.user;

  if (!username) {
    res.send(
      `<h3>No user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`
    );
    return;
  }
  console.log("user: " + username);

  const schema = Joi.string().max(20).required();
  const validationResult = schema.validate(username);

  // If we didn't use Joi to validate and check for a valid URL parameter below
  // we could run our userCollection.find and it would be possible to attack.
  // A URL parameter of user[$ne]=name would get executed as a MongoDB command
  // and may result in revealing information about all users or a successful
  // login without knowing the correct password.
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.send(
      "<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>"
    );
    return;
  }

  const result = await userCollection
    .find({ username: username })
    .project({ username: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);

  res.send(`<h1>Hello, ${username}!</h1>`);
});

app.get("/signup", (req, res) => {
  var html = `
    <h1>Create user</h1>
    <form action='/submitUser' method='post'>
    <input name='username' type='text' placeholder='Username'>
    <input name='email' type='email' placeholder='Email'>
    <input name='password' type='password' placeholder='Password'>
    <button>Submit</button>
    </form>
    `;
  res.send(html);
});

app.get("/login", (req, res) => {
  var html = `
    <h1>Log in</h1>
    <form action='/loggingin' method='post'>
    <input name='email' type='text' placeholder='Email'>
    <input name='password' type='password' placeholder='Password'>
    <button>Submit</button>
    </form>
    `;
  res.send(html);
});

app.post("/submitUser", async (req, res) => {
  var username = req.body.username;
  var password = req.body.password;
  var email = req.body.email;

  const schema = Joi.object({
    username: Joi.string().alphanum().max(20).required(),
    password: Joi.string().max(20).required(),
    email: Joi.string().email().required(),
  });

  const validationResult = schema.validate({ username, password, email });
  if (validationResult.error != null) {
    console.log(validationResult.error);
    var errorMessage = validationResult.error.details[0].message;
    res.send(`Error: ${errorMessage}. Please <a href="/signup">try again</a>.`);
    return;
  }

  var hashedPassword = await bcrypt.hash(password, saltRounds);

  await userCollection.insertOne({
    username: username,
    password: hashedPassword,
    email: email,
  });
  console.log("Inserted user");

  req.session.authenticated = true;
  req.session.username = username;

  res.redirect("/");
});

app.post("/loggingin", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.string().max(20).required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.redirect("/login");
    return;
  }

  const result = await userCollection
    .find({ email: email })
    .project({ username: 1, email: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);
  if (result.length != 1) {
    console.log("User not found");
    res.redirect("/login");
    return;
  }
  if (await bcrypt.compare(password, result[0].password)) {
    console.log("Correct password");
    req.session.authenticated = true;
    req.session.email = email;
    req.session.username = result[0].username;
    req.session.cookie.maxAge = expireTime;

    res.redirect("/loggedin");
    return;
  } else {
    console.log("Incorrect password");
    res.send(`Incorrect password. Please <a href="/login">try again</a>.`);
    return;
  }
});

app.get("/loggedin", (req, res) => {
  if (!req.session.authenticated) {
    res.redirect("/login");
  } else {
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect("/");
    }
  });
});

const images = [
  "nature-walk.jpeg",
  "winter-landscape.jpeg",
  "autumn-walk.jpeg",
];

app.get("/nature/:id", (req, res) => {
  var beach = req.params.id;

  if (beach == 1) {
    res.send(`<img src='/${images[0]}' style='width:250px;'>`);
  } else if (beach == 2) {
    res.send(`<img src='/${images[1]}' style='width:250px;'>`);
  } else if (beach == 3) {
    res.send(`<img src='/${images[2]}' style='width:250px;'>`);
  } else {
    res.send("Invalid nature id: " + nature);
  }
});

app.get("/members", (req, res) => {
  if (!req.session.username) {
    res.redirect("/");
    return;
  }

  const username = req.session.username;
  const image = images[Math.floor(Math.random() * images.length)];

  const html = `
    <h1>Hello, ${username}!</h1>
    <img src="/${image}" alt="Random image">
    <br><br>
    <button onclick="window.location.href='/logout'">Log out</button>
  `;

  res.send(html);
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.send("Page not found - 404");
});

app.listen(port, () => {
  console.log("Assignment 1 is listening on Port " + port + "!");
});
