const app = require('express')(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    Server = require('./objects/server');

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, *');
    
    next();
});

http.listen(5150, () => {
    console.log('Server running on port 5150');
});

let server = new Server(io);