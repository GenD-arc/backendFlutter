const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'testing_db',
  timezone: '+08:00'
});

connection.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
});

module.exports = connection;