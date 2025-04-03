import React, { useState, useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import "./index.css";

const VideoChat = () => {
    // Connection and message state
    const [connection, setConnection] = useState(null);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [meetingId, setMeetingId] = useState("test-meeting");
    const [isVideoActive, setIsVideoActive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState("disconnected");
    
    // User management
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [chatType, setChatType] = useState("group"); // "group" or "private"
    const [receiverId, setReceiverId] = useState("");
    const [userActivity, setUserActivity] = useState({}); // Track user activity timestamps
    const [pingIntervalRef, setPingIntervalRef] = useState(null); // Store the ping interval
    
    // Video call state
    const [isInCall, setIsInCall] = useState(false);
    const [callStatus, setCallStatus] = useState(""); // "incoming", "outgoing", "connected", ""
    const [remoteStreams, setRemoteStreams] = useState({});
    const [peerConnections, setPeerConnections] = useState({});
    
    // Refs
    const localVideoRef = useRef(null);
    const messagesEndRef = useRef(null);
    const localStreamRef = useRef(null);

    // Store User ID in sessionStorage
    useEffect(() => {
        let userId = sessionStorage.getItem("userId");
        if (!userId) {
            // Generate a unique ID that includes a device identifier
            const randomId = Math.floor(Math.random() * 10000);
            const deviceType = detectDeviceType();
            userId = `User-${randomId}-${deviceType}`;
            sessionStorage.setItem("userId", userId);
        }
        
        // This will help track if we're a newly connected user
        sessionStorage.setItem("isNewlyConnected", "true");
    }, []);

    const userId = sessionStorage.getItem("userId");

    // Function to detect device type
    const detectDeviceType = () => {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return "Tablet";
        }
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return "Mobile";
        }
        return "Desktop";
    };

    // Function to normalize userId by removing device identifier for display
    const getNormalizedUserId = (fullUserId) => {
        if (!fullUserId) return "";
        // Extract just the User-XXXX part without the device type
        const match = fullUserId.match(/^(User-\d+)/);
        return match ? match[1] : fullUserId;
    };

    // Auto scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (meetingId && !connection) {
            const newConnection = new signalR.HubConnectionBuilder()
                .withUrl(`https://chatappsaurabh.runasp.net/meetinghub`)
                .withAutomaticReconnect()
                .build();

            // Handle connection events
            newConnection.onreconnecting(error => {
                console.log('Connection lost, reconnecting...', error);
                setConnectionStatus('Reconnecting...');
            });

            newConnection.onreconnected(connectionId => {
                console.log('Reconnected with connection ID:', connectionId);
                setConnectionStatus('Connected');
                
                // After reconnection, try to rejoin the meeting and announce presence
                setTimeout(() => {
                    newConnection.invoke("JoinMeeting", meetingId, userId)
                        .then(() => {
                            console.log("Successfully rejoined meeting after reconnection");
                            
                            // Ensure we're in the user list
                            setUsers(prevUsers => {
                                if (!prevUsers.includes(userId)) {
                                    return [...prevUsers, userId];
                                }
                                return prevUsers;
                            });
                            
                            // Broadcast presence multiple times to ensure visibility
                            setTimeout(() => announcePresence(newConnection), 500);
                            
                            // Request an updated user list
                            setTimeout(() => refreshUserList(newConnection, meetingId), 1000);
                        })
                        .catch(err => {
                            console.error("Failed to rejoin meeting after reconnection:", err);
                        });
                }, 500);
            });

            newConnection.onclose(error => {
                console.log('Connection closed', error);
                setConnectionStatus('Disconnected');
            });

            // Handle a user joining the meeting
            newConnection.on("UserJoined", (userIdParam) => {
                console.log(`User joined: ${userIdParam}`);
                
                // Broadcast our presence to the new user after a brief delay
                setTimeout(() => {
                    try {
                        if (newConnection && newConnection.state === "connected") {
                            newConnection.invoke("SendGroupMessage", meetingId, "__USER_PRESENCE__", userId)
                                .catch(err => console.log("Presence broadcast to new user failed:", err));
                        }
                    } catch (err) {
                        console.log("Error broadcasting presence to new user:", err);
                    }
                }, 300);
                
                // Request an updated user list after a new user joins (with a delay)
                setTimeout(() => {
                    try {
                        if (newConnection && newConnection.state === "connected") {
                            newConnection.invoke("GetConnectedUsers", meetingId)
                                .then(connectedUsers => {
                                    if (Array.isArray(connectedUsers)) {
                                        setUsers(connectedUsers);
                                    }
                                })
                                .catch(err => {
                                    console.log("Error getting updated user list:", err);
                                    newConnection.invoke("RequestUserList", meetingId, userId)
                                        .catch(e => console.log("RequestUserList fallback failed:", e));
                                });
                        }
                    } catch (err) {
                        console.log("Error refreshing user list after user joined:", err);
                    }
                }, 1000);
                
                // Check if this user is already in our list (case-insensitive)
                const normalizedNewUserId = userIdParam.trim().toLowerCase();
                const isNewUser = !users.some(u => u.trim().toLowerCase() === normalizedNewUserId);
                
                // Add the user to our list if they're not already there
                if (isNewUser) {
                    setUsers(prevUsers => [...prevUsers, userIdParam]);
                    
                    // Add a system message for genuinely new users
                    setMessages(prevMessages => [
                        ...prevMessages,
                        {
                            type: "system",
                            msg: `${userIdParam} has joined the chat`,
                            timestamp: new Date()
                        }
                    ]);
                }
                
                // Update the user's activity time
                setUserActivity(prev => ({
                    ...prev,
                    [userIdParam]: Date.now()
                }));
            });

            // Handle receiving the complete user list
            newConnection.on("UserList", (userList) => {
                console.log("Received complete user list:", userList);
                
                if (Array.isArray(userList)) {
                    // Ensure we are also in the list
                    if (!userList.some(u => u.trim().toLowerCase() === userId.trim().toLowerCase())) {
                        userList.push(userId);
                    }
                    
                    // Update the users state
                    setUsers(userList);
                    
                    // Update activity timestamps for all users
                    const activityUpdates = {};
                    userList.forEach(uid => {
                        activityUpdates[uid] = Date.now();
                    });
                    
                    setUserActivity(prev => ({
                        ...prev,
                        ...activityUpdates
                    }));
                }
            });

            // Handle a user leaving the meeting
            newConnection.on("UserLeft", (leftUserId) => {
                console.log(`User left: ${leftUserId}`);
                
                // Check if this user has other active connections with similar IDs
                // Some users might have multiple connections with slight variations
                const normalizedLeftUserId = leftUserId.trim().toLowerCase();
                
                setUsers(prevUsers => {
                    // Find other possible connections from the same user (case insensitive)
                    const otherConnectionsFromSameUser = prevUsers.filter(id => 
                        id !== leftUserId && id.trim().toLowerCase() === normalizedLeftUserId
                    );
                    
                    // Only send a system message if this was their last connection
                    if (otherConnectionsFromSameUser.length === 0) {
                        setMessages(prev => [...prev, {
                            type: "system",
                            msg: `${leftUserId} has left the chat`,
                            timestamp: new Date()
                        }]);
                    }
                    
                    // Remove this specific user ID from the list
                    return prevUsers.filter(id => id !== leftUserId);
                });
                
                // Remove user from activity tracking
                setUserActivity(prev => {
                    const newActivity = { ...prev };
                    delete newActivity[leftUserId];
                    return newActivity;
                });
                
                // If this was the selected user for private chat, switch back to group chat
                if (selectedUser === leftUserId) {
                    setSelectedUser(null);
                    setMessages(prev => [...prev, {
                        type: "system",
                        msg: `Switched to group chat because ${leftUserId} left`,
                        timestamp: new Date()
                    }]);
                }
            });

            // Handle group messages, including special presence messages
            newConnection.on("ReceiveGroupMessage", (msg, sender) => {
                // Check if this is a special presence message
                if (msg === "__USER_PRESENCE__") {
                    console.log(`Received presence broadcast from: ${sender}`);
                    
                    // Update user activity timestamp
                    setUserActivity(prev => ({
                        ...prev,
                        [sender]: Date.now()
                    }));
                    
                    // Add user to the list if not already there
                    const normalizedSenderId = sender.trim().toLowerCase();
                    setUsers(prevUsers => {
                        // Check if the user exists (case-insensitive)
                        if (!prevUsers.some(u => u.trim().toLowerCase() === normalizedSenderId)) {
                            console.log(`Adding user from presence message: ${sender}`);
                            return [...prevUsers, sender];
                        }
                        return prevUsers;
                    });
                } else {
                    // Regular group message, add to messages
                    setMessages(prevMessages => [...prevMessages, { 
                        type: "group",
                        sender, 
                        msg, 
                        timestamp: new Date()
                    }]);
                }
            });

            // Handle private messages
            newConnection.on("ReceivePrivateMessage", (msg, sender) => {
                console.log(`Received private message from ${sender}`);
                
                // Add the message to our list
                setMessages(prevMessages => [...prevMessages, { 
                    type: "private",
                    sender, 
                    msg, 
                    timestamp: new Date(),
                    isIncoming: true
                }]);
                
                // Update the sender's activity time
                setUserActivity(prev => ({
                    ...prev,
                    [sender]: Date.now()
                }));
                
                // Add the sender to our users list if they're not already there
                setUsers(prevUsers => {
                    if (!prevUsers.includes(sender)) {
                        return [...prevUsers, sender];
                    }
                    return prevUsers;
                });
            });

            // WebRTC signaling handlers
            newConnection.on("ReceiveOffer", (offer, senderId) => {
                handleIncomingOffer(offer, senderId);
            });

            newConnection.on("ReceiveAnswer", (answer, senderId) => {
                handleIncomingAnswer(answer, senderId);
            });

            newConnection.on("ReceiveIceCandidate", (candidate, senderId) => {
                handleIncomingIceCandidate(candidate, senderId);
            });

            setConnection(newConnection);

            newConnection.start()
                .then(() => {
                    console.log('Connection started');
                    setConnectionStatus('Connected');
                    
                    // Mark ourselves as newly connected for special handling
                    sessionStorage.setItem('isNewlyConnected', 'true');
                    
                    // Join the meeting after connection is established
                    return newConnection.invoke("JoinMeeting", meetingId, userId);
                })
                .then(() => {
                    console.log("Successfully joined meeting:", meetingId);
                    
                    // First, make sure we add ourselves to the user list immediately
                    // This ensures the "Online Users" section is never empty
                    setUsers(prevUsers => {
                        const normalizedUserId = userId.trim().toLowerCase();
                        if (!prevUsers.some(u => u.trim().toLowerCase() === normalizedUserId)) {
                            return [...prevUsers, userId];
                        }
                        return prevUsers;
                    });
                    
                    // Store our activity time
                    setUserActivity(prev => ({
                        ...prev,
                        [userId]: Date.now()
                    }));
                    
                    // Send a presence message after a brief delay
                    setTimeout(() => {
                        try {
                            newConnection.invoke("SendGroupMessage", meetingId, "__USER_PRESENCE__", userId)
                                .catch(err => console.log("Initial presence broadcast failed:", err));
                        } catch (err) {
                            console.log("Error in initial presence broadcast:", err);
                        }
                    }, 200);
                    
                    // Request the full list of connected users after joining
                    setTimeout(() => refreshUserList(newConnection, meetingId), 500);
                    
                    // Announce presence with multiple attempts after a slightly longer delay
                    setTimeout(() => announcePresence(newConnection), 1000);
                    
                    // Set up ping interval to maintain connection and check for inactive users
                    const pingInterval = setInterval(() => {
                        if (newConnection && newConnection.state === "connected") {
                            // Update our own activity time
                            setUserActivity(prev => ({
                                ...prev, 
                                [userId]: Date.now()
                            }));
                            
                            // Every 30 seconds, check for inactive users and clean them up
                            const now = Date.now();
                            setUserActivity(prev => {
                                const activeUsers = { ...prev };
                                let inactiveFound = false;
                                
                                // Remove users inactive for more than 2 minutes
                                Object.keys(activeUsers).forEach(uid => {
                                    if (now - activeUsers[uid] > 120000) { // 2 minutes
                                        delete activeUsers[uid];
                                        inactiveFound = true;
                                    }
                                });
                                
                                // If we removed inactive users, update the user list
                                if (inactiveFound) {
                                    setUsers(currentUsers => 
                                        currentUsers.filter(u => 
                                            Object.keys(activeUsers).some(
                                                aid => aid.trim().toLowerCase() === u.trim().toLowerCase()
                                            )
                                        )
                                    );
                                }
                                
                                return activeUsers;
                            });
                            
                            // Request updated user list if we have active users
                            if (users.length > 0) {
                                newConnection.invoke("RequestUserList", meetingId, userId)
                                    .catch(err => {
                                        if (!err.toString().includes("No such method") && 
                                            !err.toString().includes("not found")) {
                                            console.log("Ping RequestUserList error:", err);
                                        }
                                    });
                            }
                            
                            // Every 2 minutes, broadcast presence to maintain visibility
                            const lastBroadcast = sessionStorage.getItem('lastPresenceBroadcast');
                            if (!lastBroadcast || (now - parseInt(lastBroadcast, 10)) > 120000) {
                                try {
                                    newConnection.invoke("SendGroupMessage", meetingId, "__USER_PRESENCE__", userId)
                                        .then(() => {
                                            sessionStorage.setItem('lastPresenceBroadcast', now.toString());
                                        })
                                        .catch(err => {
                                            console.log("Periodic presence broadcast failed:", err);
                                        });
                                } catch (err) {
                                    console.log("Error in periodic presence broadcast:", err);
                                }
                            }
                        }
                    }, 30000); // 30 seconds
                    
                    // Clear interval on unmount
                    setPingIntervalRef(pingInterval);
                })
                .catch((err) => {
                    console.error('Connection failed:', err);
                    setConnectionStatus('Connection failed');
                });
        }

        return () => {
            if (connection) {
                connection.stop();
            }
            if (pingIntervalRef) {
                clearInterval(pingIntervalRef);
                setPingIntervalRef(null);
            }
        };
    }, [meetingId, userId, users, selectedUser]);

    // WebRTC helper functions
    const handleIncomingOffer = async (offer, senderId) => {
        try {
            // If we're already in a call with the sender, ignore
            if (peerConnections[senderId]) return;
            
            setCallStatus("incoming");
            
            const confirmed = window.confirm(`Incoming video call from ${senderId}. Accept?`);
            if (!confirmed) {
                setCallStatus("");
                return;
            }
            
            // Create peer connection for the caller
            const pc = createPeerConnection(senderId);
            
            // Set the remote description (the offer)
            await pc.setRemoteDescription(JSON.parse(offer));
            
            // Get local stream if not already active
            if (!localStreamRef.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                setIsVideoActive(true);
                
                // Add tracks to the peer connection
                stream.getTracks().forEach(track => {
                    pc.addTrack(track, stream);
                });
            } else {
                // Add existing tracks
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current);
                });
            }
            
            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            await connection.invoke("SendAnswerToUser", senderId, JSON.stringify(pc.localDescription), userId);
            
            setIsInCall(true);
            setCallStatus("connected");
            
        } catch (err) {
            console.error("Error handling offer:", err);
            setCallStatus("");
        }
    };
    
    const handleIncomingAnswer = async (answer, senderId) => {
        try {
            const pc = peerConnections[senderId];
            if (!pc) return;
            
            await pc.setRemoteDescription(JSON.parse(answer));
            setCallStatus("connected");
            
        } catch (err) {
            console.error("Error handling answer:", err);
        }
    };
    
    const handleIncomingIceCandidate = async (candidate, senderId) => {
        try {
            const pc = peerConnections[senderId];
            if (!pc) return;
            
            await pc.addIceCandidate(JSON.parse(candidate));
            
        } catch (err) {
            console.error("Error handling ICE candidate:", err);
        }
    };
    
    const createPeerConnection = (peerId) => {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
            
            // Store the peer connection
            setPeerConnections(prev => ({ ...prev, [peerId]: pc }));
            
            // Handle ICE candidates
            pc.onicecandidate = event => {
                if (event.candidate) {
                    connection.invoke(
                        "SendIceCandidateToUser", 
                        peerId, 
                        JSON.stringify(event.candidate), 
                        userId
                    ).catch(err => console.error("Error sending ICE candidate:", err));
                }
            };
            
            // Handle remote track
            pc.ontrack = event => {
                setRemoteStreams(prev => {
                    const newStreams = { ...prev };
                    newStreams[peerId] = event.streams[0];
                    return newStreams;
                });
            };
            
            // Handle connection state changes
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    handleCallEnd(peerId);
                }
            };
            
            return pc;
            
        } catch (err) {
            console.error("Error creating peer connection:", err);
            return null;
        }
    };
    
    const handleCallEnd = (peerId) => {
        // Close peer connection
        const pc = peerConnections[peerId];
        if (pc) {
            pc.close();
            setPeerConnections(prev => {
                const newConnections = { ...prev };
                delete newConnections[peerId];
                return newConnections;
            });
        }
        
        // Remove remote stream
        setRemoteStreams(prev => {
            const newStreams = { ...prev };
            delete newStreams[peerId];
            return newStreams;
        });
        
        // If no more connections, end the call
        if (Object.keys(peerConnections).length === 0) {
            setIsInCall(false);
            setCallStatus("");
            
            // Stop local stream if active
            if (localStreamRef.current && isVideoActive) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
                if (localVideoRef.current) localVideoRef.current.srcObject = null;
                setIsVideoActive(false);
            }
        }
    };
    
    const startCall = async (receiverId) => {
        try {
            if (isInCall) {
                alert("Already in a call. End current call before starting a new one.");
                return;
            }
            
            setCallStatus("outgoing");
            
            // Get local media stream
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            setIsVideoActive(true);
            
            // Create peer connection
            const pc = createPeerConnection(receiverId);
            
            // Add tracks to the peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
            
            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            await connection.invoke("SendOfferToUser", receiverId, JSON.stringify(pc.localDescription), userId);
            
            setIsInCall(true);
            
        } catch (err) {
            console.error("Error starting call:", err);
            setCallStatus("");
            
            // Clean up
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
            setIsVideoActive(false);
        }
    };

    // Helper for UI
    const handleUserSelect = (userId) => {
        setSelectedUser(userId);
        setChatType("private");
    };
    
    const switchToGroupChat = () => {
        setSelectedUser(null);
        setChatType("group");
    };
    
    // For display in chat header
    const getDisplayName = (userId) => {
        return getNormalizedUserId(userId);
    };

    const endCall = () => {
        // End all peer connections
        Object.keys(peerConnections).forEach(peerId => {
            handleCallEnd(peerId);
        });
    };

    const sendMessage = async () => {
        if (connection && message.trim()) {
            try {
                if (chatType === "private" && selectedUser) {
                    // Send private message
                    console.log("Sending private message to:", selectedUser, "Content:", message);
                    await connection.invoke("SendPrivateMessage", selectedUser, message, userId);
                    
                    // Add to local messages - this ensures we see our own messages in the chat
                    setMessages(prevMessages => [
                        ...prevMessages, 
                        { 
                            type: "private",
                            sender: userId, 
                            msg: message, 
                            timestamp: new Date(),
                            recipientId: selectedUser,
                            isOutgoing: true // Mark as outgoing for reference
                        }
                    ]);
                } else {
                    // Send group message - don't add locally, it will come back via ReceiveGroupMessage
                    await connection.invoke("SendGroupMessage", meetingId, message, userId);
                }
                setMessage("");
            } catch (err) {
                console.error("Error sending message:", err);
                // Show error to user
                alert(`Failed to send message: ${err.toString()}`);
            }
        }
    };

    const startVideoCall = async () => {
        try {
            if (isInCall) {
                alert("You are already in a call.");
                return;
            }
            
            if (isVideoActive) {
                // Stop the video
                if (localStreamRef.current) {
                    localStreamRef.current.getTracks().forEach(track => track.stop());
                    localStreamRef.current = null;
                }
                if (localVideoRef.current) {
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
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
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

    // Function to announce our presence to all users in the meeting
    const announcePresence = (conn = connection) => {
        if (!conn || conn.state !== "connected") return;
        
        console.log("Announcing presence to all users");
        
        // Send a special announcement message
        setMessages(prev => [...prev, {
            type: "system",
            msg: "Broadcasting your presence to all users...",
            timestamp: new Date()
        }]);
        
        // Broadcast multiple times with increasing delays
        [100, 500, 1500, 3000].forEach(delay => {
            setTimeout(() => {
                try {
                    conn.invoke("SendGroupMessage", meetingId, "__USER_PRESENCE__", userId)
                        .catch(err => console.log(`Presence broadcast failed (${delay}ms):`, err));
                } catch (err) {
                    console.log(`Error in presence broadcast (${delay}ms):`, err);
                }
            }, delay);
        });
        
        // After the last broadcast, confirm to the user
        setTimeout(() => {
            setMessages(prev => [...prev, {
                type: "system",
                msg: "Presence broadcast complete",
                timestamp: new Date()
            }]);
        }, 3500);
    };

    // Function to refresh user list from server with multiple approaches
    const refreshUserList = (conn, meetingIdParam) => {
        if (!conn || conn.state !== "connected") return;
        
        console.log("Refreshing user list for meeting:", meetingIdParam);
        
        // First, make sure we add ourselves to the list
        setUsers(prevUsers => {
            if (!prevUsers.includes(userId)) {
                return [...prevUsers, userId];
            }
            return prevUsers;
        });
        
        // Try multiple methods to get the user list
        const attemptMethods = [
            // Method 1: GetConnectedUsers API
            () => {
                return conn.invoke("GetConnectedUsers", meetingIdParam)
                    .then((connectedUsers) => {
                        if (Array.isArray(connectedUsers) && connectedUsers.length > 0) {
                            console.log("User list from GetConnectedUsers:", connectedUsers);
                            // Update the users list with the server's list
                            setUsers(connectedUsers);
                            return true;
                        }
                        return false;
                    })
                    .catch(err => {
                        console.log("GetConnectedUsers failed:", err);
                        return false;
                    });
            },
            
            // Method 2: RequestUserList API
            () => {
                return conn.invoke("RequestUserList", meetingIdParam, userId)
                    .then(() => {
                        console.log("RequestUserList sent");
                        return false; // Success but we don't get immediate response
                    })
                    .catch(err => {
                        console.log("RequestUserList failed:", err);
                        return false;
                    });
            },
            
            // Method 3: Broadcast presence message
            () => {
                return conn.invoke("SendGroupMessage", meetingIdParam, "__USER_PRESENCE__", userId)
                    .then(() => {
                        console.log("Presence broadcast sent");
                        return false; // Success but we don't get immediate response
                    })
                    .catch(err => {
                        console.log("Presence broadcast failed:", err);
                        return false;
                    });
            }
        ];
        
        // Try each method in sequence
        const tryNextMethod = (index) => {
            if (index >= attemptMethods.length) {
                console.log("All refresh methods attempted");
                return;
            }
            
            attemptMethods[index]()
                .then(success => {
                    if (!success) {
                        // Try the next method
                        tryNextMethod(index + 1);
                    }
                })
                .catch(() => {
                    // Try the next method
                    tryNextMethod(index + 1);
                });
        };
        
        // Start the sequence
        tryNextMethod(0);
    };

    // Manual refresh function for user interaction
    const handleRefreshUsers = () => {
        if (connection && connection.state === "connected") {
            setUsers([]); // Clear the list temporarily to show refresh is happening
            
            // Show a temporary status message
            const statusMsg = {
                type: "system",
                msg: "Refreshing user list...",
                timestamp: new Date()
            };
            
            setMessages(prev => [...prev, statusMsg]);
            
            // Try multiple approaches to discover users
            refreshUserList(connection, meetingId);
            
            // Then explicitly announce our presence
            setTimeout(announcePresence, 500);
            
            // After a delay, try refreshing again and remove the status message
            setTimeout(() => {
                refreshUserList(connection, meetingId);
                
                // Add confirmation message
                setMessages(prev => {
                    // Filter out the temporary status message
                    const filtered = prev.filter(m => m !== statusMsg);
                    
                    return [...filtered, {
                        type: "system",
                        msg: "User list refreshed.",
                        timestamp: new Date()
                    }];
                });
            }, 2000);
        }
    };

    // Check if a user is active recently (last 2 minutes)
    const isUserActive = (user) => {
        const activityTime = userActivity[user];
        if (!activityTime) return false;
        
        const now = Date.now();
        const inactiveTimeout = 2 * 60 * 1000; // 2 minutes
        return (now - activityTime) < inactiveTimeout;
    };

    // Get relative time for user activity
    const getActivityTime = (user) => {
        const activityTime = userActivity[user];
        if (!activityTime) return "Unknown";
        
        const seconds = Math.floor((Date.now() - activityTime) / 1000);
        
        if (seconds < 60) return "Just now";
        if (seconds < 120) return "1 minute ago";
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 7200) return "1 hour ago";
        return `${Math.floor(seconds / 3600)} hours ago`;
    };

    return (
        <div className="w-full max-w-5xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-xl transition-all duration-200">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                    Video Chat Room
                </h1>
                <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${
                        connectionStatus === "connected" ? "bg-green-500 animate-pulse" : 
                        connectionStatus === "connecting" ? "bg-yellow-500 animate-pulse" : 
                        "bg-red-500"
                    }`}></span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {connectionStatus === "connected" ? "Connected" : 
                         connectionStatus === "connecting" ? "Connecting..." : 
                         "Connection Error"}
                    </span>
                    {connectionStatus !== "connected" && (
                        <button 
                            onClick={() => {
                                if (connection) {
                                    setConnectionStatus("connecting");
                                    
                                    // Safe reconnection
                                    const reconnect = async () => {
                                        try {
                                            if (connection.state !== "disconnected") {
                                                await connection.stop();
                                            }
                                            
                                            await connection.start();
                                            console.log("Reconnected to server");
                                            
                                            await connection.invoke("JoinMeeting", meetingId, userId);
                                            setConnectionStatus("connected");
                                            
                                            // Refresh user list
                                            refreshUserList(connection, meetingId);
                                        } catch (err) {
                                            console.error("Manual reconnect failed:", err);
                                            setConnectionStatus("error");
                                        }
                                    };
                                    
                                    // Use setTimeout to ensure UI updates before attempting reconnection
                                    setTimeout(reconnect, 100);
                                }
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded"
                        >
                            Reconnect
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-3/4 flex flex-col lg:flex-row gap-6">
                    {/* Video Section */}
                    <div className="flex-1 flex flex-col">
                        <div className="mb-3 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isInCall ? "bg-red-500" : "bg-blue-500"} ${isInCall || isVideoActive ? "animate-pulse" : ""}`}></div>
                                <span className="font-semibold text-gray-800 dark:text-white">
                                    {isInCall ? "In Call" : "Local Video"}
                                </span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-300 bg-white/30 dark:bg-black/30 px-2 py-1 rounded-md">
                                ID: <span className="font-mono">{userId}</span>
                            </div>
                        </div>
                        
                        <div className="relative bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl overflow-hidden aspect-video shadow-md">
                            {callStatus === "incoming" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10 text-white">
                                    <div className="animate-pulse mb-2">Incoming Call...</div>
                                </div>
                            )}
                            {callStatus === "outgoing" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10 text-white">
                                    <div className="animate-pulse mb-2">Calling...</div>
                                </div>
                            )}
                            
                            {!isVideoActive && !isInCall && (
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
                                muted
                                className="w-full h-full object-cover"
                            ></video>
                        </div>
                        
                        {isInCall ? (
                            <div className="mt-4 flex justify-center">
                                <button
                                    onClick={endCall}
                                    className="px-6 py-3 rounded-full shadow-md flex items-center justify-center gap-2 transition-all duration-200 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-medium"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    End Call
                                </button>
                            </div>
                        ) : (
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
                        )}
                        
                        {/* Remote video streams */}
                        {Object.keys(remoteStreams).length > 0 && (
                            <div className="mt-4">
                                <div className="mb-2 font-semibold text-gray-800 dark:text-white">Remote Videos</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {Object.entries(remoteStreams).map(([peerId, stream]) => (
                                        <div key={peerId} className="relative rounded-xl overflow-hidden bg-black aspect-video">
                                            <video
                                                autoPlay
                                                playsInline
                                                className="w-full h-full object-cover"
                                                ref={el => {
                                                    if (el && stream) el.srcObject = stream;
                                                }}
                                            />
                                            <div className="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
                                                {peerId}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat Section */}
                    <div className="flex-1 flex flex-col">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                </svg>
                                <span className="font-semibold text-gray-800 dark:text-white">
                                    {chatType === "private" && selectedUser 
                                        ? `Chat with ${getDisplayName(selectedUser)}` 
                                        : "Group Chat"}
                                </span>
                            </div>
                            {chatType === "private" && selectedUser && (
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={switchToGroupChat}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Back to Group
                                    </button>
                                    {!isInCall && isVideoActive && (
                                        <button 
                                            onClick={() => startCall(selectedUser)}
                                            className="flex items-center gap-1 text-sm bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-full"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" />
                                            </svg>
                                            Call
                                        </button>
                                    )}
                                </div>
                            )}
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
                                messages
                                    .filter(msg => {
                                        // Filter messages based on current chat type and selection
                                        if (chatType === "group") {
                                            return msg.type === "group" || msg.type === "system";
                                        } else if (chatType === "private" && selectedUser) {
                                            // For private messages, we need to check for message direction
                                            if (msg.type === "system") return false; // Don't show system messages in private chats
                                            if (msg.type !== "private") return false;
                                            
                                            // Messages sent by current user to selected user
                                            const isOutgoingToSelectedUser = 
                                                msg.sender === userId && 
                                                msg.recipientId === selectedUser;
                                            
                                            // Messages received from selected user
                                            const isIncomingFromSelectedUser = 
                                                msg.sender === selectedUser && 
                                                msg.recipientId === userId;
                                                
                                            // Handle normalized IDs (in case the same user is on multiple devices)
                                            const senderMatches = 
                                                getNormalizedUserId(msg.sender) === getNormalizedUserId(selectedUser);
                                            const recipientMatches = 
                                                msg.recipientId && getNormalizedUserId(msg.recipientId) === getNormalizedUserId(userId);
                                                
                                            return isOutgoingToSelectedUser || 
                                                   isIncomingFromSelectedUser || 
                                                   (senderMatches && recipientMatches);
                                        }
                                        return false; // Default: don't show anything if conditions aren't met
                                    })
                                    .map((msg, index) => (
                                        <div
                                            key={index}
                                            className={`flex mb-3 ${
                                                msg.type === "system" 
                                                    ? "justify-center" 
                                                    : (msg.sender === userId ? "justify-end" : "justify-start")
                                            }`}
                                        >
                                            {msg.type === "system" ? (
                                                <div className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-1.5 rounded-full text-xs font-medium">
                                                    {msg.msg}
                                                </div>
                                            ) : (
                                                <div
                                                    className={`max-w-[80%] rounded-2xl shadow-sm px-4 py-3 ${
                                                        msg.sender === userId
                                                            ? "bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-600 dark:to-purple-600 text-white rounded-tr-none"
                                                            : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-tl-none"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="font-semibold text-sm">
                                                            {msg.sender === userId ? "You" : (
                                                                <button 
                                                                    className="hover:underline"
                                                                    onClick={() => handleUserSelect(msg.sender)}
                                                                >
                                                                    {getNormalizedUserId(msg.sender)}
                                                                </button>
                                                            )}
                                                            {msg.type === "private" && (
                                                                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                                                    private
                                                                </span>
                                                            )}
                                                        </div>
                                                        {msg.timestamp && (
                                                            <div className="text-xs opacity-75 ml-2 flex items-center">
                                                                {formatTime(msg.timestamp)}
                                                                {msg.type === "private" && msg.sender === userId && (
                                                                    <span className="ml-1" title={msg.isOutgoing ? "Message sent" : "Message delivered"}>
                                                                        ✓
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="break-words">{msg.msg}</div>
                                                </div>
                                            )}
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
                                    placeholder={`Type a ${chatType === "private" && selectedUser ? "private" : "group"} message...`}
                                    className="w-full p-4 pl-5 pr-12 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                                />
                                <div className="absolute left-4 top-0 transform -translate-y-1/2 px-2 text-xs font-medium rounded-full" style={{backgroundColor: chatType === "private" ? "#e879f9" : "#60a5fa", color: "white"}}>
                                    {chatType === "private" && selectedUser ? `Private: ${getDisplayName(selectedUser)}` : "Group Chat"}
                                </div>
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
                
                {/* User List Sidebar */}
                <div className="lg:w-1/4 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-md">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-800 dark:text-white">Online Users</h3>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleRefreshUsers}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center"
                                title="Refresh user list"
                            >
                                <svg className={`w-3.5 h-3.5 mr-1 ${users.length === 0 ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </button>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {users.length === 0 ? (
                                    <span className="animate-pulse">Searching...</span>
                                ) : (
                                    `${users.length} online`
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                        Click on a user to start a private chat
                    </div>
                    
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {users.length === 0 ? (
                            <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
                                <div className="animate-pulse mb-2">Looking for users...</div>
                                <button 
                                    onClick={announcePresence}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full"
                                >
                                    Broadcast Presence
                                </button>
                            </div>
                        ) : (
                            users
                                .filter(uId => uId !== userId)
                                .map(user => {
                                    // Normalize the user ID for display purposes
                                    const displayName = getNormalizedUserId(user);
                                    
                                    return (
                                    <div 
                                        key={user} 
                                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                            selectedUser === user 
                                                ? "bg-blue-100 dark:bg-blue-900" 
                                                : "hover:bg-gray-100 dark:hover:bg-gray-700"
                                        }`}
                                        onClick={() => handleUserSelect(user)}
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isUserActive(user) ? "bg-green-500" : "bg-gray-400"}`}></div>
                                                <span className="text-gray-800 dark:text-white">{displayName}</span>
                                                {user.includes("Mobile") && (
                                                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                                        📱
                                                    </span>
                                                )}
                                                {user.includes("Tablet") && (
                                                    <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">
                                                        📟
                                                    </span>
                                                )}
                                                {user.includes("Desktop") && (
                                                    <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full">
                                                        💻
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-4">
                                                {getActivityTime(user)}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleUserSelect(user);
                                                }}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                title="Chat privately"
                                            >
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            {isVideoActive && !isInCall && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startCall(user);
                                                    }}
                                                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                                                    title="Video call"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })
                        )}
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={switchToGroupChat}
                            className={`w-full py-2 rounded-lg text-center ${
                                chatType === "group" 
                                    ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-medium" 
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                            }`}
                        >
                            Group Chat
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoChat;

