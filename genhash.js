// genhash.js
const bcrypt = require('bcrypt');
bcrypt.hash('admin123', 10).then(h => console.log(h)).catch(console.error);
