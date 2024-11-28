CREATE DATABASE xo_game;

CREATE TABLE users (
    user_id INT PRIMARY KEY,    
    username VARCHAR(100) NOT NULL, 
    password VARCHAR(255) NOT NULL,   
    email VARCHAR(100) NOT NULL UNIQUE,  
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE games (
    game_id SERIAL PRIMARY KEY,    
    player1_id INT NOT NULL,       
    player2_id INT NOT NULL,    
    current_turn_player_id INT NOT NULL,                 
    game_status VARCHAR(20) DEFAULT 'ongoing', 
    winner_id INT,   
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (player1_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (winner_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE invitations (
    invitation_id SERIAL PRIMARY KEY,  -- Changed to SERIAL for consistency
    sender_user_id INT NOT NULL,            
    receiver_user_id INT NOT NULL,            
    status VARCHAR(20) DEFAULT 'pending', 
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (sender_user_id) REFERENCES users(user_id) ON DELETE CASCADE,  -- Corrected column name
    FOREIGN KEY (receiver_user_id) REFERENCES users(user_id) ON DELETE CASCADE  -- Corrected column name
);

CREATE TABLE game_moves (
    move_id SERIAL PRIMARY KEY,  -- Changed to SERIAL for consistency
    game_id INT NOT NULL,              
    player_id INT NOT NULL,           
    position INT NOT NULL,        
    move_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(user_id) ON DELETE CASCADE
);
