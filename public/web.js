// Constants
var TileState = {
	UNPRESSED: 0,
	PRESSED: 1,
	WINNING: 2,
};

var STANDARD_TIMEOUT = 10;

var ClientMessages = {
	JOIN: "join",
	START: "start",
	PRESS: "press",
	EXIT: "exit",
	CONNECTION: "connection",
	DISCONNECT: "disconnect"
};

var ServerMessages = {
	CONNECT_RESULT: "ConnectResult",
	JOIN_RESULT : "JoinResult",
	PLAYER_LIST_UPDATE: "PlayerListUpdate",
	GAME_START: "GameStart",
	TILE_PRESS: "TilePress",
	VICTORY: "Victory",
	GAME_RESET: "GameReset"
};

// These get preloaded in init()
var EventSounds = {
	START: null,
	PRESS: null,
	WIN: null
}

var PlayerStateOptions = {
	WATCHING: 'playerIsWatching',
	WANTS_TO_JOIN: 'playerWantsToJoin',
	HAS_JOINED: 'playerHasJoined'
}

var ControlButtons = {
	START: "#startGameButton",
	ENTER: "#enterGameButton",
	EXIT: "#exitGameButton"
}

// This uses a distinct namespace from TileState since there's no 
//     functionality attached to these display modes.
var WELCOME_SCREEN_BOARD_COLOR = [
	[1,0,0,1],
	[1,0,0,1],
	[1,0,0,1],
	[1,0,0,1]];
var GAME_START_BOARD_COLOR = [
	[1,0,0,1],
	[3,0,0,1],
	[1,0,0,1],
	[1,0,0,1]];

var TileColor = {
	GRAY: 0,
	RED: 1,
	GREEN: 2,
	RED_FLASH: 3,
	GREEN_FLASH: 4,
}


// State shared between client and server
var GlobalGameState = {
	GameInProgress: false,
	Players: [],
	Board: null,
	CurrentId: -1,
	WinningTile: null,
}

var PrivateLocalState = {
	PlayerName: null,
	PlayerViewState: PlayerStateOptions.WATCHING,
	ControlButtonsToDisplay: [ControlButtons.ENTER],
	GameStartTileFlash: false,
	GameWinTileFlash: false,
	WelcomeErrorMessage: null
}

$(function() {

	var socket = io();

	init();

	// Server sends data about its state upon connection
	socket.on(ServerMessages.CONNECT_RESULT, function(data) {
		updateGlobalGameState(data);

		if (GlobalGameState.GameInProgress) {
			hideWelcomeScreen();
		}

		renderPlayerList();
		renderControlButtons();
		renderJoinBox();
		// Initialize title screen flashing
		renderGrid();

	})

	$('#enterGameButton').click(function() {
		// Player has just loaded page, display input box
		PrivateLocalState.PlayerViewState = PlayerStateOptions.WANTS_TO_JOIN;
		$('#playerInput').focus();
		renderJoinBox();
		renderControlButtons([]);
		// Blur grid in case they're watching game
		renderGrid();
		return false;
	})

	// Join game when player presses button
	$('#joinGameButton').click(function() {

		// Fake a real disabled attribute
		// if ($(this).hasClass('disabled')) { return false; }

		var name = $('#playerInput').val();
		if (name != '') {
			console.log('Attempting to join game');
			socket.emit(ClientMessages.JOIN, { 
				name: name
			});
			// Disable button -- will be re-enabled if problem joining
			// $('#joinGameButton').toggleClass('disabled', true);
		}

		return false;

	})

	// In case the form submits, do the same thing as button press
	$('#joinGameForm').submit(function() {
		$('#joinGameButton').click();
		return false;
	})

	// Player receives acknowledgement from server after attempting to join
	socket.on(ServerMessages.JOIN_RESULT, function(data) {
		updateGlobalGameState(data);
		
		if (data.success) {
			console.log('Player successfully joined game');

			// Save the name after server has confirmed success
			PrivateLocalState.PlayerName = data.name;
			renderPlayerList();

			PrivateLocalState.PlayerViewState = PlayerStateOptions.HAS_JOINED;
			renderJoinBox();
			renderControlButtons([ControlButtons.START, ControlButtons.EXIT]);
			// This clears the message if it's no longer applicable
			displayTemporaryErrorMessage(data.message);

		} else {
			console.log('ERR: ', data.message);
			// $('#joinGameButton').toggleClass('disabled', false);
			displayTemporaryErrorMessage(data.message);
		}


	})

	// A player has joined the game somewhere else
	socket.on(ServerMessages.PLAYER_LIST_UPDATE, function(data) {
		updateGlobalGameState(data);
		renderPlayerList();
	})

	$('#startGameButton').click(function() {

		// Fake a real disabled attribute
		if ($(this).hasClass('disabled')) { return false; }

		// Notify server, then server responds with official start
		socket.emit(ClientMessages.START, {});

		return false;

	});

	// Server notifies that game is definitely starting
	socket.on(ServerMessages.GAME_START, function(data) {
		updateGlobalGameState(data);
		PrivateLocalState.GameStartTileFlash = true;
		window.setTimeout(function() {
			PrivateLocalState.GameStartTileFlash = false;
			renderGrid();
		}, 2000);
		renderGrid();
		playSound(EventSounds.START);

		hideWelcomeScreen();

		if (PrivateLocalState.PlayerName != null) {
			renderControlButtons([ControlButtons.EXIT]);
		} else {
			renderControlButtons([ControlButtons.ENTER]);
			// Close the join box if it's open
			PrivateLocalState.PlayerViewState = PlayerStateOptions.WATCHING;
			renderJoinBox();
		}


	});

	// In-game event, sent from anywhere (local or remote player)
	socket.on(ServerMessages.TILE_PRESS, function(data) {
		updateGlobalGameState(data);
		renderGrid();
		playSound(EventSounds.PRESS);
	})

	// In-game event, the local user has pressed a tile
	$('#flashpad a.tile').click(function() {

		if (PrivateLocalState.GameStartTileFlash || PrivateLocalState.GameWinTileFlash) {
			return false;
		}

		// Ignore presses when not local player's turn
		var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
		if (currentPlayerName != PrivateLocalState.PlayerName) { 
			console.log('It is not your turn!', currentPlayerName, PrivateLocalState.PlayerName);
			return false;
		}
		var pressX = $(this).data('x');
		var pressY = $(this).data('y');

		if (GlobalGameState.Board[pressY, pressX] != TileState.UNPRESSED) {
			console.log("This tile is already pressed.", pressX, pressY);
		}

		console.log('Tile Press', pressX, pressY);

		socket.emit(ClientMessages.PRESS, {
			x: pressX,
			y: pressY
		});

		return false;

	});

	socket.on(ServerMessages.VICTORY, function(data) {
		updateGlobalGameState(data);

		PrivateLocalState.GameWinTileFlash = true;
		renderGrid();
		playSound(EventSounds.WIN);

		window.setTimeout(function() {
			PrivateLocalState.GameWinTileFlash = false;
			renderGrid();
			showWelcomeScreen();
			renderPlayerList();
		}, 3000);

		var winningPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
		if (winningPlayerName == PrivateLocalState.PlayerName) {
			$('#turn').text("You win, " + winningPlayerName + "!").addClass('highlight');
		} else {
			$('#turn').text(winningPlayerName + " wins Find Me!").removeClass('highlight');
		}

	})

	// A player disconnected or timed out
	socket.on(ServerMessages.GAME_RESET, function(data) {

		var gameWasInProgress = GlobalGameState.GameInProgress;
		updateGlobalGameState(data);

		// We'll be displaying a new player list either way
		renderPlayerList();

		// If game is running, must stop game and return to title screen
		if (gameWasInProgress) {
			renderGrid();
			showWelcomeScreen();
			displayTemporaryErrorMessage(data.message);
		}

	})

	$('#exitGameButton').click(function() {
		console.log("Attempting to disconnect");
		PrivateLocalState.PlayerName = null;
		socket.emit(ClientMessages.EXIT, {});
		showWelcomeScreen();
		return false;
	});

});

var renderJoinBox = function() {

	// Display the correct text on join button
	if (GlobalGameState.GameInProgress) {
		$('#joinGameButton').val("Join Next Game");
	} else {
		$('#joinGameButton').val("Join Now");
	}

	// Set class that controls what join/exit buttons are displayed
	for (var i in PlayerStateOptions) {
		$('body').removeClass(PlayerStateOptions[i]);
	}
	$('body').addClass(PrivateLocalState.PlayerViewState);

}

var renderPlayerList = function() {

	// Truncate Players List, then Recreate List
	$('#players ul').html('');
	GlobalGameState.Players.map(function(name) {
		var playerItem = $('<li></li>').text(name);
		$('#players ul').append(playerItem);
	})

	// Only allow starting game if player has joined and 2 or more players
	$('#startGameButton').toggleClass('disabled', 
		(GlobalGameState.Players.length <= 1 || PrivateLocalState.PlayerName == null));
	$('#noPlayersMsg').toggle(GlobalGameState.Players.length < 1);

	if (PrivateLocalState.WelcomeErrorMessage != null) {
		$('#generalGameMessage').text(PrivateLocalState.WelcomeErrorMessage);
	} else {
		$('#generalGameMessage').text("");
	}
	
}

var showWelcomeScreen = function() {
	$('#players').removeClass('offscreen');
	if (PrivateLocalState.PlayerName == null) {
		renderControlButtons([ControlButtons.ENTER]);
		PrivateLocalState.PlayerViewState = PlayerStateOptions.WATCHING;
	} else {
		renderControlButtons([ControlButtons.START, ControlButtons.EXIT]);
		PrivateLocalState.PlayerViewState = PlayerStateOptions.HAS_JOINED;
	}
	renderJoinBox();
	renderPlayerList();
}

var hideWelcomeScreen = function() {
	$('#players').addClass('offscreen');	
}

var renderGrid = function() {

	// TODO render grid differently when on title screen
	// TODO render grid differently when on starting screen

	// Don't display current player or update grid if game starting, ending, or not in progress
	if (PrivateLocalState.GameStartTileFlash 
		|| PrivateLocalState.GameWinTileFlash
		|| !GlobalGameState.GameInProgress) { 
		renderGridNotInGame();
	} else {
		renderGridInGame();
	}

	$('#flashpadWrapper').toggleClass('isObscured', 
		!GlobalGameState.GameInProgress 
		|| PrivateLocalState.PlayerViewState == PlayerStateOptions.WANTS_TO_JOIN)

}

var renderGridNotInGame = function() {

	console.log("NotInGame Render");

	// Game-winning tile flash prevents normal rendering
	// Display 
	if (PrivateLocalState.GameWinTileFlash) {
		for (var y = 0; y < 4; y++) {
			for (var x = 0; x < 4; x++) {
				var tile = $('#flashpad a').eq((y*4)+x);
				tile.removeClass('red');
				tile.removeClass('green');
				tile.removeClass('red-flash');
				tile.removeClass('green-flash');
				if (GlobalGameState.WinningTile.y == y && GlobalGameState.WinningTile.x == x) {
					tile.addClass('green-flash');
				}
			}
		}
		return;
	}

	// Otherwise, display according to a pre-set pattern
	var layout = PrivateLocalState.GameStartTileFlash ? 
		GAME_START_BOARD_COLOR : WELCOME_SCREEN_BOARD_COLOR;

	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.toggleClass('red', layout[y][x] == TileColor.RED);
			tile.toggleClass('green', layout[y][x] == TileColor.GREEN);
			tile.toggleClass('red-flash', layout[y][x] == TileColor.RED_FLASH);
			tile.toggleClass('green-flash', layout[y][x] == TileColor.GREEN_FLASH);
		}
	}

	$('#turn').text("");

}

var renderGridInGame = function() {

	console.log("InGame Render");

	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.toggleClass('red', GlobalGameState.Board[y][x] == TileState.UNPRESSED);
			tile.toggleClass('green', GlobalGameState.Board[y][x] == TileState.PRESSED);
			tile.removeClass('red-flash');	// Never used to represent tile state
			tile.toggleClass('green-flash', GlobalGameState.Board[y][x] == TileState.WINNING);
		}
	}

	var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
	if (currentPlayerName == PrivateLocalState.PlayerName) {
		$('#turn').text("Your turn, " + currentPlayerName + "!").addClass('highlight');
	} else {
		$('#turn').text("Waiting for " + currentPlayerName + "...").removeClass('highlight');
	}

}

var displayTemporaryErrorMessage = function(msg) {

	PrivateLocalState.WelcomeErrorMessage = msg;
	// If it's the same message, clear it
	window.setTimeout(function() {
		if (PrivateLocalState.WelcomeErrorMessage == msg) {
			PrivateLocalState.WelcomeErrorMessage = null;
		}
		renderPlayerList();
	}, 5000);
	renderPlayerList();

}

var updateGlobalGameState = function(data) {
	console.log("Updating Game State", data);
	GlobalGameState = data.state;
}

var init = function() {

	// Initialize the data attributes on grid tiles only once
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.data({ 'x': x, 'y': y});
		}
	}

	// Preload sound files
	EventSounds.PRESS = new Audio("/sound/press.mp3");
	EventSounds.START = new Audio("/sound/start.mp3");
	EventSounds.WIN = new Audio("/sound/win.mp3");

}

var renderControlButtons = function(buttons) {
	if (buttons !== undefined) {
		PrivateLocalState.ControlButtonsToDisplay = buttons;
	}

	// Annoyingly can't do this CSS-only because callback doesn't work properly
	$('#gameControl').animate({
		bottom: '-100px'
	}, 200, null, function() {

		$('#gameControl .actionbutton').removeClass('buttonIsActive buttonIsHalf');

		for (var i in PrivateLocalState.ControlButtonsToDisplay) {
			var buttonSelector = PrivateLocalState.ControlButtonsToDisplay[i];
			$(buttonSelector).addClass('buttonIsActive');
		}

		if (PrivateLocalState.ControlButtonsToDisplay.length > 1) {
			$('#gameControl .actionbutton').addClass('buttonIsHalf');
		}

		// Re-display the bar once buttons have been modified
		$('#gameControl').animate({
			bottom: '10px'
		}, 200)

	})

}

var playSound = function(soundObj) {
	if (isDebug()) { return; } 		// Save Andrew's sanity during dev work

	// If not HAVE_ENOUGH_DATA don't try to play
	if (soundObj.readyState < 4) { return; }
	soundObj.currentTime = 0;
	soundObj.play();
}

var isDebug = function() {
	return (window.location.href.indexOf("localhost") > -1);
}