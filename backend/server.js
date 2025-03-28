import 'dotenv/config.js';
import http from 'http';
import app from './app.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Project from './models/project.model.js';
import { generateResult } from './services/ai.service.js';

const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

//middleware for socke.io
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[1];
        const projectId = socket.handshake.query.projectId;

        if(!mongoose.Types.ObjectId.isValid(projectId)){
            return next(new Error('Invalid Project'));
        }

        socket.project = await Project.findById(projectId);

        if(!token){
            return next(new Error('Authorization error'))
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if(!decoded){
            return next(new Error('Authorization error'))
        }

        socket.user = decoded;

        next();

    } catch (error) {
        next(error)
    }
})

io.on('connection', socket => {
    socket.roomId = socket.project._id.toString();

    console.log(`User ${socket.user.email} connected to project ${socket.roomId}`);
    
    socket.join(socket.roomId);

    // Let everyone in the room know a new user has joined
    socket.to(socket.roomId).emit('user-joined', {
        email: socket.user.email,
        userId: socket.user._id
    });

    socket.on('project-message', async data => {     
        const message = data.message;
        const aiIsPresentInMessage = message.includes("@ai");     
        
        // Make sure to broadcast with the correct sender information
        socket.broadcast.to(socket.roomId).emit('project-message', data);

        if(aiIsPresentInMessage){
            const prompt = message.replace('@ai', '');
            const result = await generateResult(prompt);

            io.to(socket.roomId).emit('project-message', {
                message: result,
                sender: {
                    _id: 'ai',
                    email: 'AI'
                }
            });
            return;
        }
    });

    socket.on('disconnect', () => { 
        console.log(`User ${socket.user?.email} disconnected from project ${socket.roomId}`);
        socket.leave(socket.roomId);
    });
});

server.listen(port, () => {
    console.log(`Server is runnung on port ${port}`);
    
})