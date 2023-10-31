const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

app.use(cors());

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET","POST"],
    },
})

io.on("connection",(socket)=>{
    socket.currentUser = {}

    console.log(`User Connected: ${socket.id}`)
    // Set Username
    socket.on('set_username', (data) => {
        console.log(`Player ${data.username} created.`)
        logToClient(socket.currentUser.roomID, `Player ${data.username} created.`)

        socket.emit("receive_username", data)
        socket.currentUser.username = data.username
    })

    // Create or Join room
    socket.on("joinRoom", (roomID) => {

      const username = socket.currentUser.username

        if (roomID) {
          socket.join(roomID);
          socket.currentUser.roomID = roomID;
          socket.emit('roomID', roomID); // Send the room ID back to the user
          console.log(`Player ${username} joined room ${roomID}`)
          logToClient(roomID, `Player ${username} joined room ${roomID}.`)

          const existingUsernames = getUsernamesInRoom(roomID);
          setUsernamesInRoom(roomID,[...existingUsernames, username])
          socket.currentUser.host = false;

          // Emit the updated userlist to all clients in the room
          io.to(roomID).emit('usersRoomReceive', getUsernamesInRoom(roomID));


        } else {
          const newRoomID = generateUniqueCode(); // Generate a unique room ID
          socket.join(newRoomID);
          socket.currentUser.roomID = newRoomID;
          socket.emit('roomID', newRoomID); // Send the room ID back to the user
          console.log(`Player ${username} created room ${newRoomID}.`);
          logToClient(newRoomID, `Player ${username} created room ${newRoomID}.`)
          socket.currentUser.host = true;

          setUsernamesInRoom(newRoomID,[username])
        }
      });
      
    socket.on("usersRoomRequest", (data) => { 
      let usernames = getUsernamesInRoom(data)
      console.log('usernames in room:')
      console.log(usernames)

      if(data){
        socket.emit('usersRoomReceive',usernames)
        checkHost(socket)
        // if(socket.currentUser.host === true){
        //   socket.emit('checkHost',{host:true});
        // }else{
        //   socket.emit('checkHost',{host:false});
        // }

      }else{
        console.log(`Room ${data} does not exist.`);
      }
    })

    socket.on("initiate_game", (gameid)=>{
      io.to(socket.currentUser.roomID).emit("game_initiated",gameid);
    })


    socket.on("start_game_session", async ({ roomid, gameid }) => {
    io.to(roomid).emit("game_started");
    if(gameid == 1){ //GAME 1      

      let currentQuestion = null;
    
      try {
        // Get the current question
        currentQuestion = await generateNewQuestion();
    
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


    });
  
})

server.listen(3001, () => {
    console.log('SERVER IS RUNNING');
})

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

  const generateNewQuestion = async () => {
    try {
      const response = await fetch('https://api.truthordarebot.xyz/v1/truth');
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

  // Define a Map to store usernames in rooms
const usernamesInRooms = new Map();

// Function to get usernames in a specific room
function getUsernamesInRoom(roomID) {
  return usernamesInRooms.get(roomID) || [];
}

// Function to set usernames in a specific room
function setUsernamesInRoom(roomID, usernames) {
  usernamesInRooms.set(roomID, usernames);
}

function logToClient(roomID, message){
  console.log('server sends log')
  // io.emit('log_message',{message})
  io.to(roomID).emit('log_message', { message });
}