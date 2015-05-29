var express = require('express'),
  http = require('http'),
  logger = require('morgan');

// Set up application.
var app = express();
var port = process.env.PORT || 3000;

app.use(logger('dev'));

app.get('/', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
});

app.use("/", express.static(__dirname + "/public/"));

var server = http.createServer(app).listen(port, function() {
    console.log('Listening on port ' + port);
});

var io = require('socket.io').listen(server);

var sockets = [];

var serverPort = 3000;


function Food(x,y){
    this.x = x;
    this.y = y;
    this.id = (new Date()).getTime(); //This should be changed because it's predictable
    this.color = this.randomColor(); //murica
}


Food.prototype.randomColor = function() {
    var color = '#' + ('00000'+(Math.random()*(1<<24)|0).toString(16)).slice(-6),
        difference = 32,
        c = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color),
        r = parseInt(c[1], 16) - difference,
        g = parseInt(c[2], 16) - difference,
        b = parseInt(c[3], 16) - difference;

    if (r < 0) {
        r = 0;
    }
    if (g < 0) {
        g = 0;
    }
    if (b < 0) {
        b = 0;
    }

    return {
        fill: color,
        border: '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
    };
};

function Player(x,y,id){
    this.x = x;
    this.y = y; 
    this.target = {};
    this.target.x = x;
    this.target.y = y;
    this.id = id;
    this.mass = 0;
    this.speed = 80;
    this.connected = false;
    this.name = undefined;
}

Player.prototype.disconnect = function(){
    throw "Not Implemented";
};

Player.prototype.notify = function(){
    throw "Not Implemented";
};




function Game(){
    
    this.maxSizeMass = 50;
    this.maxMoveSpeed = 10;
    this.massDecreaseRatio = 1000;
    this.foodMass = 1;
    this.newFoodPerPlayer = 3;
    this.respawnFoodPerPlayer = 1;
    this.foodRandomWidth = 500;
    this.foodRandomHeight = 500;
    this.maxFoodCount = 50;
    this.noPlayer = 0;
    this.defaultPlayerSize = 10;
    this.eatableMassDistance = 5;
    this.users = [];
    this.foods = [];
}

Game.prototype.genPos = function(from, to) {
    return Math.floor(Math.random() * to) + from;
};

Game.prototype.addFoods = function(target) {
    var rx = this.genPos(0, target.screenWidth);
    var ry = this.genPos(0, target.screenHeight);
    var food = new Food(rx,ry);
    game.foods[game.foods.length] = food;
};

Game.prototype.generateFood = function(target) {
    if (this.foods.length < this.maxFoodCount) {
        this.addFoods(target);
    }
};

Game.prototype.findPlayer = function(id) {
    for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].id == id) {
            return this.users[i];
        }
    }
    return null;
};

Game.prototype.findPlayerIndex = function(id) {
    for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].id == id) {
            return i;
        }
    }

    return -1;
};

Game.prototype.findFoodIndex = function(id) {
    for (var i = 0; i < this.foods.length; i++) {
        if (this.foods[i].id == id) {
            return i;
        }
    }

  return -1;
};

Game.prototype.hitTest = function(start, end, min) {
    var distance = Math.sqrt((start.x - end.x) * (start.x - end.x) + (start.y - end.y) * (start.y - end.y));
    return (distance <= min);
};


Game.prototype.movePlayer = function(player, target) {
    var xVelocity = target.x - player.x,
        yVelocity = target.y - player.y,
        vMag = Math.sqrt(xVelocity * xVelocity + yVelocity * yVelocity),
        normalisedX = xVelocity/vMag,
        normalisedY = yVelocity/vMag,
        finalX = vMag > 25 ? normalisedX * 250 / player.speed : xVelocity * 10 / player.speed,
        finalY = vMag > 25 ? normalisedY * 250 / player.speed : yVelocity * 10 / player.speed;

    player.x += finalX;
    player.y += finalY;
};

Game.prototype.tick = function(onTick){
    var _this = this;
    
    this.users.forEach(function(player){
        if (player.target.x != player.x && player.target.y != player.y) {
            _this.movePlayer(player, player.target);
        }
        for (var f = 0; f < _this.foods.length; f++) {
            if (_this.hitTest(
                { x: _this.foods[f].x, y: _this.foods[f].y },
                { x: player.x, y: player.y },
                player.mass + _this.defaultPlayerSize
            )) {
                _this.foods[f] = {};
                _this.foods.splice(f, 1);

                if (player.mass < _this.maxSizeMass) {
                    player.mass += _this.foodMass;
                }

                if (player.speed < _this.maxMoveSpeed) {
                    player.speed += player.mass / _this.massDecreaseRatio;
                }

                console.log("Food eaten");

                // Respawn food
                for (var r = 0; r < _this.respawnFoodPerPlayer; r++) {
                    _this.generateFood(player);
                }
                break;
            }
        }
        for (var e = 0; e < _this.users.length; e++) {
            if (_this.hitTest(
                { x: _this.users[e].x, y: _this.users[e].y },
                { x: player.x, y: player.y },
                player.mass + _this.defaultPlayerSize
            )) {
                if (_this.users[e].mass !== 0 && _this.users[e].mass < player.mass - _this.eatableMassDistance) {           
                    if (player.mass < _this.maxSizeMass) {
                        player.mass += _this.users[e].mass;
                    }

                    if (player.speed < _this.maxMoveSpeed) {
                        player.speed += player.mass / _this.massDecreaseRatio;
                    }
                    _this.users[e].disconnect();
                    _this.users.splice(e, 1);
                    break;
                }
            }
        }
        player.notify();
    });
    if (onTick){
        onTick();
    }
      
};

var game = new Game();
setInterval(function(){
    game.tick();
},16); //60fps ish

io.on('connection', function(socket) {  
    console.log('A user connected. Assigning UserID...');

    var player = new Player(0,0,socket.id);
    player.disconnect = function(){
        socket.emit("RIP");
        socket.disconnect();
                    
    };
    
    player.notify = function(){
        socket.emit("serverTellPlayerMove", player);
        socket.emit("serverTellPlayerUpdateFoods", game.foods);
        socket.broadcast.emit("serverUpdateAllPlayers", game.users);
        socket.broadcast.emit("serverUpdateAllFoods", game.foods);
    };
    
    socket.emit("welcome", player);
  
    socket.on("gotit", function(remotePlayer) {
        if (!player.connected) {
            console.log("Player " + player.id + " connected!");
            player.name = remotePlayer.name.replace(/(<([^>]+)>)/ig,"");
            player.screenWidth = remotePlayer.screenWidth; //Want to depricate this...
            player.screenHeight = remotePlayer.screenHeight; //And this... 
            player.connected = true;
            sockets[player.id] = socket;
            game.users.push(player);
        }

        socket.emit("playerJoin", { playersList: game.users, connectedName: player.name });
        socket.broadcast.emit("playerJoin", { playersList: game.users, connectedName: player.name });
        console.log("Total player: " + game.users.length);
        

        // Add new food when player connected
        for (var i = 0; i < game.newFoodPerPlayer; i++) {
            game.generateFood(player);
        }
    });

    socket.on("ping", function(){
        socket.emit("pong");
    });

    socket.on('disconnect', function() {
        game.users.splice(game.users.indexOf(player), 1);
        console.log('User #' + player.id + ' disconnected');
        socket.broadcast.emit("playerDisconnect", { playersList: game.users, disconnectName: player.name });
    });

    socket.on("playerChat", function(data){
        var _sender = data.sender.replace(/(<([^>]+)>)/ig,"");
        var _message = data.message.replace(/(<([^>]+)>)/ig,"");
        socket.broadcast.emit("serverSendPlayerChat", { sender: _sender, message: _message });
    });

    // Heartbeat function, update everytime
    socket.on("playerSendTarget", function(target) {
        //Want to refactor this so that it simply saves the target destination of the player but gets updated somewhere else
        player.target = target;
    });
});
