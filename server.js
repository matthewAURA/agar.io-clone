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
    }
};

function Player(x,y,id){
    this.x = x;
    this.y = y; 
    this.id = id;
    this.mass = 0;
    this.speed = 80;
    this.connected = false;
    this.name = undefined;
}




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

var game = new Game();

io.on('connection', function(socket) {  
    console.log('A user connected. Assigning UserID...');

    var userID = socket.id;
    var currentPlayer = {};
    var player = new Player(0,0,userID);
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
            currentPlayer = player;
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
        var playerIndex = game.findPlayerIndex(userID);
        var playerName = game.users[playerIndex].name;
        game.users.splice(playerIndex, 1);
        console.log('User #' + userID + ' disconnected');
        socket.broadcast.emit("playerDisconnect", { playersList: game.users, disconnectName: playerName });
    });

    socket.on("playerChat", function(data){
        var _sender = data.sender.replace(/(<([^>]+)>)/ig,"");
        var _message = data.message.replace(/(<([^>]+)>)/ig,"");
        socket.broadcast.emit("serverSendPlayerChat", { sender: _sender, message: _message });
    });

    // Heartbeat function, update everytime
    socket.on("playerSendTarget", function(target) {
        //Want to refactor this so that it simply saves the target destination of the player but gets updated somewhere else
        
        if (target.x != currentPlayer.x && target.y != currentPlayer.y) {
            game.movePlayer(currentPlayer, target);
            //game.users[game.findPlayerIndex(currentplayer.id)] = currentPlayer;

            for (var f = 0; f < game.foods.length; f++) {
                if (game.hitTest(
                    { x: game.foods[f].x, y: game.foods[f].y },
                    { x: currentPlayer.x, y: currentPlayer.y },
                    currentPlayer.mass + game.defaultPlayerSize
                )) {
                    game.foods[f] = {};
                    game.foods.splice(f, 1);

                    if (currentPlayer.mass < game.maxSizeMass) {
                        currentPlayer.mass += game.foodMass;
                    }

                    if (currentPlayer.speed < game.maxMoveSpeed) {
                        currentPlayer.speed += currentPlayer.mass / game.massDecreaseRatio;
                    }

                    console.log("Food eaten");

                    // Respawn food
                    for (var r = 0; r < game.respawnFoodPerPlayer; r++) {
                        game.generateFood(currentPlayer);
                    }
                    break;
                }
            }

            for (var e = 0; e < game.users.length; e++) {
                if (game.hitTest(
                    { x: game.users[e].x, y: game.users[e].y },
                    { x: currentPlayer.x, y: currentPlayer.y },
                    currentPlayer.mass + game.defaultPlayerSize
                )) {
                    if (game.users[e].mass != 0 && game.users[e].mass < currentPlayer.mass - game.eatableMassDistance) {           
                        if (currentPlayer.mass < maxSizeMass) {
                            currentPlayer.mass += game.users[e].mass;
                        }

                        if (currentPlayer.speed < maxMoveSpeed) {
                            currentPlayer.speed += currentPlayer.mass / game.massDecreaseRatio;
                        }
                        sockets[game.users[e].playerID].emit("RIP");
                        sockets[game.users[e].playerID].disconnect();
                        game.users.splice(e, 1);
                        break;
                    }
                }
            }

            // Do some continuos emit
            socket.emit("serverTellPlayerMove", currentPlayer);
            socket.emit("serverTellPlayerUpdateFoods", game.foods);
            socket.broadcast.emit("serverUpdateAllPlayers", game.users);
            socket.broadcast.emit("serverUpdateAllFoods", game.foods);
        }
    });
});
