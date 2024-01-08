const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config(); 
const PORT = process.env.PORT || 3001

app.use(cors());

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: [
          process.env.CLIENT_URL,
          process.env.CLIENT_URL + '/*',
          process.env.DEPLOYMENT_URL],
        methods: ["GET","POST"],
    },
    reconnection: false, // Disable reconnection
    reconnectionAttempts: 0, // Set the number of reconnection attempts to 0
})

app.get('/', (req, res) => {
  res.send(`<h1>Socket IO runs on Port: ${PORT}</h1>`);
});

io.on("connection",(socket)=>{
    if (!socket.currentUser) {
        socket.currentUser = {};
    }

    console.log(`User Connected: ${socket.id}`)

    // Set Username
    socket.on('set_username', (data) => {
        const username = data.username
        // console.log(`Player ${socket.currentUser.username} created.`)
        // Check if roomID is available before logging to the client


        // if (socket.currentUser.roomID) {
        //   logToClient(socket.currentUser.roomID, `Player ${ socket.currentUser.username} created.`)
        // }
        socket.emit("receive_userdata", {username,uniqueIdentifier})
        
    })

    // Create or Join room
    socket.on("joinRoom", ({roomID,userid,username}) => {


      // console.log('Current User Details 2:', socket.currentUser);

        if (roomID) {
          socket.join(roomID);
          // localStorage.setItem('roomID',roomID);
          const isHost = false

          socket.emit('roomID', {roomID,isHost}); // Send the room ID back to the user
          console.log(`Player ${username} joined room ${roomID}`)
          logToClient(roomID, `Player ${username} joined room ${roomID}.`)

          // setUsernamesInRoom(roomID,[...existingUsernames, username])

          setUserInRoom(roomID, username, userid);

          // localStorage.setItem('isHost',false);
          
          // socket.emit('set_roomIDnHost',{roomID,isHost})

          // Emit the updated userlist to all clients in the room
          io.to(roomID).emit('usersRoomReceive', getUsernamesInRoom(roomID));

        } else {
          const newRoomID = generateUniqueCode(); // Generate a unique room ID
          socket.join(newRoomID);
          // localStorage.setItem('roomID',newRoomID);
          const isHost = true
          const roomID = newRoomID
          // socket.emit('set_roomIDnHost',{newRoomID,isHost})
    

          socket.emit('roomID', {roomID,isHost}); // Send the room ID back to the user
          console.log(`Player ${username} created room ${newRoomID}.`);
          logToClient(newRoomID, `Player ${username} created room ${newRoomID}.`)
        
          setUserInRoom(newRoomID, username, userid);

        }
      });

      
    socket.on("usersRoomRequest", (data) => { 
      let usernames = getUsernamesInRoom(data)    

      if(data){
        socket.emit('usersRoomReceive',usernames)
        checkHost(socket)
      }else{
        console.log(`Room ${data} does not exist.`);
      }
    })

    socket.on("initiate_game", ({selectedGame,roomID})=>{
    //   io.to(socket.currentUser.roomID).emit("game_initiated",gameid);
    // })
      io.to(roomID).emit("game_initiated",selectedGame);
    })

    socket.on("request_start_game_session", ({roomid, gameid})=>{
      io.to(roomid).emit("start_game_session",({roomid,gameid}));
      console.log('server2')
    })

    socket.on("game_session", async ({ roomid, gameid }) => {
      console.log('server4')

      socket.currentUser = {}

      socket.currentUser.gameState = {
        gameStarted: false,
        users: getUsernamesInRoom(roomid),
        currentPlayerIndex: null,
        scores: {},
      };

      const {gameState} = socket.currentUser

      io.to(roomid).emit("game_started",gameState);

      // const room = io.sockets.adapter.rooms.get(roomid);
      // const socketIdsInRoom = Array.from(room);
      // console.log(socketIdsInRoom)

      //GAME 1
      if(gameid == 1){ 
        
        let currentQuestion = null;

        //DECIDE WHOSE TURN
        decideTurn({gameState})

        //QUESTION
        generateQuestion({currentQuestion,roomid})


        socket.on('handleAnswer', ({ userid, answer, roomid }) => {
          let username;
        
          gameState.users.forEach(user => {
            if (getSocketIDByUsername(user) === userid) {
              username = user;
            }
          });
        
          const updatedScores = {
            ...gameState.scores,
            [username]: (gameState.scores[username] || 0) + answer,
          };
        
          gameState.scores = updatedScores;
        
          // Emit the updated scores to all clients in the room
          io.to(roomid).emit('updated_scores', gameState.scores);
        
          if (updatedScores[username] > 4) {
            let winner = username;
            io.to(roomid).emit('game_over', { winner });
          } else {
            decideTurn({ gameState });
            let currentQuestion = null;
            generateQuestion({ currentQuestion, roomid });
          }
        });

        socket.on('clear_scores', ({ roomid }) => {
          gameState.scores = {}
          const room = io.sockets.adapter.rooms.get(roomid);
          if (room) {
            for (const socketId of room) {
              const socketInRoom = io.sockets.sockets.get(socketId);
              if (socketInRoom && socketInRoom.currentUser) {
                socketInRoom.currentUser.gameState.scores = {};
              }
            }
          }
          io.to(roomid).emit('game_restarted');
          io.to(roomid).emit('updated_scores', gameState.scores);
          decideTurn({ gameState });
          let currentQuestion = null;
          generateQuestion({ currentQuestion, roomid });
        });

        console.log(gameState)

        socket.on('disconnect_all_users', () => {
          const roomID = socket.currentUser.roomID;
          io.to(roomID).emit('disconnect_all_users');
          socket.disconnect(true);
        });

        socket.on('disconnect_user', () => {
          socket.emit('disconnect_user')
          socket.disconnect(true);
        });

      }
      
    });
  
})

// const serverUrl = process.env.SERVER_URL;

// server.listen(process.env.SERVER_URL, () => {
//     console.log('SERVER IS RUNNING');
// })

server.listen(PORT, () => {
  console.log('SERVER IS RUNNING');
});


function checkHost(socket) {
  const isHost = socket.currentUser && socket.currentUser.host === true;
  socket.emit('checkHost', { host: isHost });
  return isHost;
}

function generateUniqueCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }
  return code;
}

let apiUrl = process.env.API_URL;

const fetchQuestionFromAPI = async () => {
  
  try {
    const response = await fetch(`${apiUrl}`);
    const data = await response.json();
    const {question} = data

    return {
      // category: data.category,
      // question: data.truth,
      question
    };
  } catch (error) {
    console.error('Error fetching truth data:', error);
    return null; // Return null if there's an error
  }
};

function decideTurn({gameState}) {
  gameState.gameStarted = true;

  gameState.currentPlayerIndex = Math.floor(Math.random() * gameState.users.length)

  // console.log(gameState)

  gameState.users.forEach((user, index) => {
    const currentPlayerSocketID = getSocketIDByUsername(user);


    const isCurrentPlayer = index === gameState.currentPlayerIndex;

    io.to(currentPlayerSocketID).emit("current_player_turn", isCurrentPlayer);
  });
  
}

const generateQuestion = async ({currentQuestion,roomid}) => {
  try {
    // Get the current question
    currentQuestion = await fetchQuestionFromAPI();
    if (currentQuestion) {
      // Broadcast the current question to all users in the room
      io.to(roomid).emit('current_question', currentQuestion);
    } else {
      console.error('Failed to get a new question');
    }
  } catch (error) {
    console.error('Error generating a new question:', error);
  }
}

// Define a Map to store usernames in rooms
const usernamesInRooms = new Map();

const usernamesToSocketIDs = new Map();

// Function to get usernames in a specific room
function getUsernamesInRoom(roomID) {
  const usernames = usernamesInRooms.get(roomID) || [];
  console.log(`Usernames in room ${roomID}:`, usernames);
  return usernames;
}

function getSocketIDByUsername(username) {
  return usernamesToSocketIDs.get(username);
}

function setUserInRoom(roomID, username, socketID) {
  const usernames = usernamesInRooms.get(roomID) || [];
  usernamesInRooms.set(roomID, [...usernames, username]);
  usernamesToSocketIDs.set(username, socketID);
}


function logToClient(roomID, message){
  console.log('server sends log')
  io.to(roomID).emit('log_message', { message });
}
