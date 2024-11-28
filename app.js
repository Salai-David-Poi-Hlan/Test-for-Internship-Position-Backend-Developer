const express = require('express');
const session=require("express-session")
const con = require('./config/db');
const bcrypt = require('bcrypt');
const http=require('http')
const socketIo = require('socket.io');


const app = express();
const server=http.createServer(app)
const io=socketIo(server)


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const saltRounds = 10;


app.use(session({
    secret: 'ttcwqqxC 123245636474@A4U975NEBEBDJHVEZSAE',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));


app.post("/register", function (req, res) {
    const { username, password, email } = req.body;


    if (!username || !password || !email) {
        return res.status(400).json({ message: "All fields are required" });
    }


   
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ message: "Error hashing password" });
        }


        const query = 'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING user_id';
       
        con.query(query, [username, hashedPassword, email])
            .then(result => {
                const userId = result.rows[0].user_id;
                res.status(201).json({
                    message: "User registered successfully",
                    user_id: userId,
                    username: username,
                });
            })
            .catch(err => {
                console.error("Error inserting user:", err);
                res.status(500).json({ message: "Internal Server Error" });
            });
    });
});




app.post("/login", (req, res) => {
    const { username, password } = req.body;


    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }




    const query = 'SELECT user_id, username, password FROM users WHERE username = $1';
    con.query(query, [username])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }


            const user = result.rows[0];
       
            bcrypt.compare(password, user.password, (err, match) => {
                if (err) {
                    return res.status(500).json({ message: "Error comparing passwords" });
                }


                if (match) {
               
                    req.session.userId = user.user_id;
                    req.session.username = user.username;
                    res.status(200).json({ message: "Login successful", userId: user.user_id });
                } else {
                    res.status(400).json({ message: "Invalid password" });
                }
            });
        })
        .catch(err => {
            console.error("Error during login:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});



app.get('/players', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }


    const query = 'SELECT user_id, username FROM users WHERE user_id != $1';
    con.query(query, [req.session.userId])
        .then(result => {
            res.status(200).json({ players: result.rows });
        })
        .catch(err => {
            console.error("Error fetching players:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});


app.post('/invitations/send', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }


    const { receiver_user_id } = req.body;
    const sender_user_id = req.session.userId;


    if (!receiver_user_id) {
        return res.status(400).json({ message: "Receiver user ID is required" });
    }


   
    if (sender_user_id === receiver_user_id) {
        return res.status(400).json({ message: "You cannot invite yourself" });
    }


    
    const query = 'INSERT INTO invitations (sender_user_id, receiver_user_id, status) VALUES ($1, $2, $3) RETURNING invitation_id';
    con.query(query, [sender_user_id, receiver_user_id, 'pending'])
        .then(result => {
            const invitation_id = result.rows[0].invitation_id;
            res.status(200).json({ message: "Invitation sent successfully", invitation_id });
        })
        .catch(err => {
            console.error("Error sending invitation:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});


app.get('/invitations/received', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }


    const query = 'SELECT * FROM invitations WHERE receiver_user_id = $1 AND status = $2';
    con.query(query, [req.session.userId, 'pending'])
        .then(result => {
            res.status(200).json({ invitations: result.rows });
        })
        .catch(err => {
            console.error("Error fetching invitations:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});






app.post('/games/bot/start', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }

    const userId = req.session.userId;

    // Create a new game against the bot (bot is represented by 999)
    const query = `
        INSERT INTO games (player1_id, player2_id, current_turn_player_id, game_status)
        VALUES ($1, 999, $1, 'ongoing') RETURNING game_id
    `;

    con.query(query, [userId])
        .then(result => {
            const gameId = result.rows[0].game_id;

            // Notify the user that the game has started and it's their turn
            res.status(200).json({
                message: "Game started against the bot",
                game_id: gameId,
                first_player: userId,  // User goes first
            });
        })
        .catch(err => {
            console.error("Error starting game against bot:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});






// Route to accept a game invitation
app.post('/invitations/accept', (req, res) => {
    const { invitation_id } = req.body;
    if (!invitation_id) {
        return res.status(400).json({ message: "Invitation ID is required" });
    }


    const query = 'SELECT * FROM invitations WHERE invitation_id = $1';
    con.query(query, [invitation_id])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Invitation not found" });
            }


            const invitation = result.rows[0];
            const senderId = invitation.sender_user_id;
            const receiverId = invitation.receiver_user_id;


            // Create the game, starting with the receiver (invitee) as the first player
            const gameQuery = `
                INSERT INTO games (player1_id, player2_id, current_turn_player_id, game_status)
                VALUES ($1, $2, $2, 'ongoing') RETURNING game_id
            `;
            con.query(gameQuery, [senderId, receiverId]) // receiver (invitee) goes first
                .then(result => {
                    const gameId = result.rows[0].game_id;


                    // Mark the invitation as accepted
                    const updateInvitationQuery = `
                        UPDATE invitations SET status = 'accepted' WHERE invitation_id = $1
                    `;
                    con.query(updateInvitationQuery, [invitation_id])
                        .then(() => {
                            res.status(200).json({
                                message: "Game started successfully",
                                game_id: gameId,
                                first_player: receiverId // receiver (invitee) is the first player
                            });
                        })
                        .catch(err => {
                            console.error("Error updating invitation:", err);
                            res.status(500).json({ message: "Internal Server Error" });
                        });
                })
                .catch(err => {
                    console.error("Error creating game:", err);
                    res.status(500).json({ message: "Internal Server Error" });
                });
        })
        .catch(err => {
            console.error("Error fetching invitation:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});









app.post('/games/move', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }


    const { game_id, position } = req.body;
    const current_player_id = req.session.userId;


    // Validate the input parameters
    if (typeof game_id !== 'number' || position < 0 || position > 8) {
        return res.status(400).json({ message: "Invalid game or position" });
    }


    // Get the current game state
    const getGameQuery = 'SELECT * FROM games WHERE game_id = $1';
    con.query(getGameQuery, [game_id])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Game not found" });
            }


            const game = result.rows[0];


            // Check if the game is ongoing
            if (game.game_status !== 'ongoing') {
                return res.status(400).json({ message: "Game is not ongoing" });
            }


            // Check if it's the player's turn
            if (game.current_turn_player_id !== current_player_id) {
                return res.status(400).json({ message: "It's not your turn" });
            }


            // Check if the position is already taken
            const checkMoveQuery = 'SELECT * FROM game_moves WHERE game_id = $1 AND position = $2';
            con.query(checkMoveQuery, [game_id, position])
                .then(moveResult => {
                    if (moveResult.rows.length > 0) {
                        return res.status(400).json({ message: "Position already taken" });
                    }


                    // Insert the move into the game_moves table
                    const insertMoveQuery = 'INSERT INTO game_moves (game_id, player_id, position) VALUES ($1, $2, $3) RETURNING move_id';
                    con.query(insertMoveQuery, [game_id, current_player_id, position])
                        .then(moveInsertResult => {
                            // Update the current player's turn
                            const next_turn_player_id = game.player1_id === current_player_id ? game.player2_id : game.player1_id;
                            const updateTurnQuery = 'UPDATE games SET current_turn_player_id = $1 WHERE game_id = $2';
                            con.query(updateTurnQuery, [next_turn_player_id, game_id]);


                            // Check the game status after the move
                            checkGameStatus(game_id, current_player_id, res);
                        })
                        .catch(err => {
                            console.error("Error inserting move:", err);
                            res.status(500).json({ message: "Internal Server Error" });
                        });
                })
                .catch(err => {
                    console.error("Error checking move:", err);
                    res.status(500).json({ message: "Internal Server Error" });
                });
        })
        .catch(err => {
            console.error("Error fetching game:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});


// Helper function to check game status after each move
function checkGameStatus(game_id, current_player_id, res) {
    const checkWinnerQuery = 'SELECT * FROM game_moves WHERE game_id = $1 ORDER BY move_id ASC';
    con.query(checkWinnerQuery, [game_id])
        .then(result => {
            const moves = result.rows;
            const board = Array(9).fill(null); // Create a 3x3 board


            // Map moves to board positions
            moves.forEach(move => {
                board[move.position] = move.player_id;
            });


            // Winning combinations (index positions for Tic-Tac-Toe)
            const winningCombinations = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
                [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
                [0, 4, 8], [2, 4, 6]              // Diagonals
            ];


            let winner_id = null;


            // Check for a winner
            winningCombinations.forEach(combination => {
                const [a, b, c] = combination;
                if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                    winner_id = board[a]; // Player who won
                }
            });


            if (winner_id) {
                // If there's a winner, update the game status
                const updateGameQuery = 'UPDATE games SET game_status = $1, winner_id = $2 WHERE game_id = $3';
                con.query(updateGameQuery, ['finished', winner_id, game_id])
                    .then(() => {
                        res.status(200).json({ message: "Game finished", winner_id: winner_id });
                    })
                    .catch(err => {
                        console.error("Error updating game status:", err);
                        res.status(500).json({ message: "Internal Server Error" });
                    });
            } else if (board.every(cell => cell !== null)) {
                // Draw if all positions are filled and no winner
                const updateGameQuery = 'UPDATE games SET game_status = $1 WHERE game_id = $2';
                con.query(updateGameQuery, ['draw', game_id])
                    .then(() => {
                        res.status(200).json({ message: "Game is a draw" });
                    })
                    .catch(err => {
                        console.error("Error updating game status:", err);
                        res.status(500).json({ message: "Internal Server Error" });
                    });
            } else {
                // Game is still ongoing, no winner yet
                res.status(200).json({ message: "Game is ongoing" });
            }
        })
        .catch(err => {
            console.error("Error checking winner:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
}



app.post('/games/bot/move', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }

    const { game_id, position } = req.body;
    const current_player_id = req.session.userId;

    // Validate the input parameters
    if (typeof game_id !== 'number' || position < 0 || position > 8) {
        return res.status(400).json({ message: "Invalid game or position" });
    }

    // Get the current game state
    const getGameQuery = 'SELECT * FROM games WHERE game_id = $1';
    con.query(getGameQuery, [game_id])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Game not found" });
            }

            const game = result.rows[0];

            // Check if the game is ongoing
            if (game.game_status !== 'ongoing') {
                return res.status(400).json({ message: "Game is not ongoing" });
            }

            // Check if it's the player's turn (player vs. bot)
            if (game.current_turn_player_id !== current_player_id) {
                return res.status(400).json({ message: "It's not your turn" });
            }

            // Check if the position is already taken
            const checkMoveQuery = 'SELECT * FROM game_moves WHERE game_id = $1 AND position = $2';
            con.query(checkMoveQuery, [game_id, position])
                .then(moveResult => {
                    if (moveResult.rows.length > 0) {
                        return res.status(400).json({ message: "Position already taken" });
                    }

                    // Insert the player's move
                    const insertMoveQuery = 'INSERT INTO game_moves (game_id, player_id, position) VALUES ($1, $2, $3) RETURNING move_id';
                    con.query(insertMoveQuery, [game_id, current_player_id, position])
                        .then(moveInsertResult => {
                            // Update the current player's turn to the bot (player ID = 999)
                            const next_turn_player_id = 999; // Bot's player ID
                            const updateTurnQuery = 'UPDATE games SET current_turn_player_id = $1 WHERE game_id = $2';
                            con.query(updateTurnQuery, [next_turn_player_id, game_id]);

                            // Make the bot's move
                            makeBotMove(game_id, res);
                        })
                        .catch(err => {
                            console.error("Error inserting player's move:", err);
                            res.status(500).json({ message: "Internal Server Error" });
                        });
                })
                .catch(err => {
                    console.error("Error checking position:", err);
                    res.status(500).json({ message: "Internal Server Error" });
                });
        })
        .catch(err => {
            console.error("Error fetching game:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});


function makeBotMove(game_id, res) {
    const getGameQuery = 'SELECT * FROM games WHERE game_id = $1';
    con.query(getGameQuery, [game_id])
        .then(gameResult => {
            if (gameResult.rows.length === 0) {
                return res.status(404).json({ message: "Game not found" });
            }
            const game = gameResult.rows[0];  // This is the `game` object you're looking for

            // Log current turn player before making any changes
            console.log('Current turn player before bot move:', game.current_turn_player_id);

            // Check if the game is ongoing
            if (game.game_status !== 'ongoing') {
                return res.status(400).json({ message: "Game is not ongoing" });
            }

            // Check if the game has a valid turn for the bot (the bot's ID is 999)
            if (game.current_turn_player_id !== 999) {  // Assuming the bot's ID is 999
                return res.status(400).json({ message: "It's not the bot's turn" });
            }

            // Query for the bot's previous move
            const getBotMoveQuery = 'SELECT * FROM game_moves WHERE game_id = $1 AND player_id = 999 ORDER BY move_id DESC LIMIT 1';
            con.query(getBotMoveQuery, [game_id])
                .then(botMoveResult => {
                    let previousBotMove = null;
                    if (botMoveResult.rows.length > 0) {
                        previousBotMove = botMoveResult.rows[0].position;  // Last move position of the bot
                    }

                    // Log bot's previous move (if exists)
                    console.log('Bot previous move (0-8):', previousBotMove);

                    // Proceed with bot's move logic

                    const checkAvailablePositionsQuery = 'SELECT position FROM game_moves WHERE game_id = $1';
                    con.query(checkAvailablePositionsQuery, [game_id])
                        .then(result => {
                            const occupiedPositions = result.rows.map(row => row.position);
                            const availablePositions = Array.from({ length: 9 }, (_, i) => i).filter(pos => !occupiedPositions.includes(pos));

                            if (availablePositions.length === 0) {
                                return res.status(400).json({ message: "No available positions left" });
                            }

                            // Bot makes a random move from available positions
                            const randomPosition = availablePositions[Math.floor(Math.random() * availablePositions.length)];

                            // Insert the bot's move
                            const insertBotMoveQuery = 'INSERT INTO game_moves (game_id, player_id, position) VALUES ($1, $2, $3) RETURNING move_id';
                            con.query(insertBotMoveQuery, [game_id, 999, randomPosition])
                                .then(() => {
                                    // After the bot moves, update the game status and switch turns
                                    const updateTurnQuery = 'UPDATE games SET current_turn_player_id = $1 WHERE game_id = $2';

                                    // Define the next_turn_player_id correctly
                                    const next_turn_player_id = (game.current_turn_player_id === game.player1_id) ? game.player2_id : game.player1_id;

                                    // Log after determining next turn player ID
                                    console.log('Updating turn to player ID:', next_turn_player_id);

                                    // Ensure that next_turn_player_id is valid and exists in the users table
                                    con.query(updateTurnQuery, [next_turn_player_id, game_id]);

                                    // Log after updating turn
                                    console.log('Turn updated to:', next_turn_player_id);

                                    // Check the game status
                                    checkGameStatus(game_id, 999, res);
                                })
                                .catch(err => {
                                    console.error("Error inserting bot's move:", err);
                                    res.status(500).json({ message: "Internal Server Error" });
                                });
                        })
                        .catch(err => {
                            console.error("Error checking available positions:", err);
                            res.status(500).json({ message: "Internal Server Error" });
                        });
                })
                .catch(err => {
                    console.error("Error fetching bot's previous move:", err);
                    res.status(500).json({ message: "Internal Server Error" });
                });
        })
        .catch(err => {
            console.error("Error fetching game:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
}


// When a user connects, we store their socket connection for the game
// WebSocket setup
io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // When the player joins a game, bind their socket to the game room
    socket.on('join_game', (game_id) => {
        console.log(`Player joined game: ${game_id}`);
        socket.join(game_id);
    });

    // When a bot makes a move, notify the players
    socket.on('bot_move', (data) => {
        socket.to(data.game_id).emit('bot_move', data);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

// Route to view game history and win-loss statistics
app.get('/games/history', (req, res) => {
    if (!req.session.userId) {
        return res.status(403).json({ message: "Please log in first" });
    }


    const userId = req.session.userId;


    // Query for the user's game history and calculate wins/losses
    const query = `
        SELECT
            (CASE WHEN winner_id = $1 THEN 'win' ELSE 'loss' END) AS result
        FROM games
        WHERE player1_id = $1 OR player2_id = $1
    `;
    con.query(query, [userId])
        .then(result => {
            const wins = result.rows.filter(row => row.result === 'win').length;
            const losses = result.rows.filter(row => row.result === 'loss').length;
            res.status(200).json({
                message: "Game history fetched successfully",
                games: result.rows,
                statistics: { wins, losses }
            });
        })
        .catch(err => {
            console.error("Error fetching game history:", err);
            res.status(500).json({ message: "Internal Server Error" });
        });
});

app.get('/', function (req, res) {
    res.send("Welcome to TIC-TAC-TOE Backend");
});


const port = 3000;
app.listen(port, function () {
    console.log("Server is running at port " + port);
});






