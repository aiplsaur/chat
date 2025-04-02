import React, { useState, useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import "./index.css";

const VideoChat = () => {
    const [connection, setConnection] = useState(null);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [meetingId] = useState("test-meeting");
    const [isVideoActive, setIsVideoActive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState("disconnected");
    const localVideoRef = useRef(null);
    const messagesEndRef = useRef(null);

    // Store User ID in sessionStorage
    useEffect(() => {
        let userId = sessionStorage.getItem("userId");
        if (!userId) {
            userId = `User-${Math.floor(Math.random() * 10000)}`;
            sessionStorage.setItem("userId", userId);
        }
    }, []);

    const userId = sessionStorage.getItem("userId");

    // Auto scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        setConnectionStatus("connecting");
        
        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl("https://chatappsaurabh.runasp.net/meetinghub", {
                transport: signalR.HttpTransportType.WebSockets,
                skipNegotiation: true
            })
            .configureLogging(signalR.LogLevel.Information)
            .withAutomaticReconnect()
            .build();

        newConnection
            .start()
            .then(() => {
                console.log("Connected to SignalR Server as", userId);
                setConnectionStatus("connected");

                newConnection.invoke("JoinMeeting", meetingId)
                    .catch(err => {
                        console.error("Error joining meeting:", err);
                        setConnectionStatus("error");
                    });

                newConnection.on("ReceiveSignal", (msg, sender) => {
                    setMessages(prevMessages => [...prevMessages, { sender, msg, timestamp: new Date() }]);
                });
            })
            .catch(err => {
                console.error("SignalR Connection Error:", err);
                setConnectionStatus("error");
            });

        setConnection(newConnection);

        return () => {
            if (newConnection) newConnection.stop();
        };
    }, []);

    const sendMessage = async () => {
        if (connection && message.trim()) {
            try {
                await connection.invoke("SendSignal", meetingId, message, userId);
                setMessages(prevMessages => [
                    ...prevMessages, 
                    { sender: userId, msg: message, timestamp: new Date() }
                ]);
                setMessage("");
            } catch (err) {
                console.error("Error sending message:", err);
            }
        }
    };

    const startVideoCall = async () => {
        try {
            if (isVideoActive) {
                // Stop the video
                const stream = localVideoRef.current.srcObject;
                if (stream) {
                    const tracks = stream.getTracks();
                    tracks.forEach(track => track.stop());
                    localVideoRef.current.srcObject = null;
                }
                setIsVideoActive(false);
                return;
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === "videoinput");

            if (!hasCamera) {
                alert("No camera detected. Please check your device settings.");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            setIsVideoActive(true);
        } catch (err) {
            console.error("Error accessing media devices:", err);
            alert("Camera access failed. Ensure it's connected and permissions are granted.");
        }
    };

    // Format timestamp
    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="w-full max-w-5xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-xl transition-all duration-200">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                    Video Chat Room
                </h1>
                <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${
                        connectionStatus === "connected" ? "bg-green-500" : 
                        connectionStatus === "connecting" ? "bg-yellow-500" : 
                        "bg-red-500"
                    }`}></span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {connectionStatus === "connected" ? "Connected" : 
                         connectionStatus === "connecting" ? "Connecting..." : 
                         "Connection Error"}
                    </span>
                </div>
            </div>
            
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Video Section */}
                <div className="flex-1 flex flex-col">
                    <div className="mb-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                            <span className="font-semibold text-gray-800 dark:text-white">Live Video</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300 bg-white/30 dark:bg-black/30 px-2 py-1 rounded-md">
                            ID: <span className="font-mono">{userId}</span>
                        </div>
                    </div>
                    
                    <div className="relative bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl overflow-hidden aspect-video shadow-md">
                        {!isVideoActive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 dark:text-gray-300">
                                <svg className="w-20 h-20 mb-4 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                    <path d="M14.5 4.5v3.5h3.5l-3.5-3.5z" fillRule="evenodd" clipRule="evenodd" />
                                </svg>
                                <p>Your video will appear here</p>
                            </div>
                        )}
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        ></video>
                    </div>
                    
                    <div className="mt-4 flex justify-center">
                        <button
                            onClick={startVideoCall}
                            className={`px-6 py-3 rounded-full shadow-md flex items-center justify-center gap-2 transition-all duration-200 ${
                                isVideoActive 
                                ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700" 
                                : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 dark:from-blue-600 dark:to-purple-700 dark:hover:from-blue-700 dark:hover:to-purple-800"
                            } text-white font-medium`}
                        >
                            {isVideoActive ? (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Stop Video
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2z" />
                                    </svg>
                                    Start Video
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Chat Section */}
                <div className="flex-1 flex flex-col">
                    <div className="mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                        </svg>
                        <span className="font-semibold text-gray-800 dark:text-white">Live Chat</span>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-80 overflow-y-auto shadow-inner mb-4">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                <svg className="w-12 h-12 mb-2 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                </svg>
                                <p className="text-center">No messages yet. Start the conversation!</p>
                            </div>
                        ) : (
                            messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`flex mb-3 ${msg.sender === userId ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl shadow-sm px-4 py-3 ${
                                            msg.sender === userId
                                                ? "bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-600 dark:to-purple-600 text-white rounded-tr-none"
                                                : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-tl-none"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="font-semibold text-sm">
                                                {msg.sender === userId ? "You" : msg.sender}
                                            </div>
                                            {msg.timestamp && (
                                                <div className="text-xs opacity-75 ml-2">
                                                    {formatTime(msg.timestamp)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="break-words">{msg.msg}</div>
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Type a message..."
                                className="w-full p-4 pl-5 pr-12 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                            />
                            {message.trim() && (
                                <button 
                                    onClick={sendMessage}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors duration-200"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoChat;

