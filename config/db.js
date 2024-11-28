
const { Client } = require('pg');


const con = new Client({
  host: 'localhost',        
  user: 'postgres',        
  password: 'zxcrty',            
  database: 'xo_game',       
  port: 5432                
});

// Connect to the PostgreSQL database
con.connect()
  .then(() => {
    console.log("Connected to PostgreSQL database");
  })
  .catch((err) => {
    console.error("Connection error", err.stack);
  });

// Export the connection object for use in other modules
module.exports = con;
