const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'b1qz2rskhp04l4ts4vtz-mysql.services.clever-cloud.com',
  user: 'uswnk88vhmavzqza',
  password: 'afkQKt13Gpr5FcTH7m2a',
  database: 'b1qz2rskhp04l4ts4vtz',
  timezone: '+08:00'
});

connection.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
});

module.exports = connection;
