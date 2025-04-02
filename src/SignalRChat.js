import React, { useState, useEffect } from "react";
import * as signalR from "@microsoft/signalr";

const SignalRChat = () => {
    const [connection, setConnection] = useState(null);
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [meetingId] = useState("test-meeting");

    // 🔹 User chooses a name (simulate login)
    const [userId, setUserId] = useState(localStorage.getItem("userId") || "");

    useEffect(() => {
        if (!userId) return; // Wait until user sets a name

        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl("http://localhost:5020/meetinghub", {
                transport: signalR.HttpTransportType.WebSockets,
                skipNegotiation: true
            })
            .configureLogging(signalR.LogLevel.Information)
            .withAutomaticReconnect()
            .build();

        newConnection
            .start()
            .then(() => {
                console.log("✅ Connected to SignalR Server");

                newConnection.invoke("JoinMeeting", meetingId, userId)
                    .catch(err => console.error("Error joining meeting:", err));

                newConnection.on("ReceiveSignal", (msg, sender) => {
                    setMessages(prevMessages => [...prevMessages, { sender, msg }]);
                });
            })
            .catch(err => console.error("❌ SignalR Connection Error:", err));

        setConnection(newConnection);

        return () => {
            if (newConnection.state === signalR.HubConnectionState.Connected) {
                newConnection.stop();
            }
        };
    }, [userId]); // 👈 Runs when userId is set

    const sendMessage = async () => {
        if (connection) {
            try {
                await connection.invoke("SendSignal", meetingId, message, userId);
                setMessages(prevMessages => [...prevMessages, { sender: userId, msg: message }]);
                setMessage("");
            } catch (err) {
                console.error("Error sending message:", err);
            }
        }
    };

    if (!userId) {
        return (
            <div style={{ textAlign: "center", padding: "20px" }}>
                <h2>Enter Your Name</h2>
                <input
                    type="text"
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Enter a username..."
                    style={{ padding: "10px", width: "250px" }}
                />
                <button onClick={() => localStorage.setItem("userId", userId)} style={{ marginLeft: "10px", padding: "10px 15px" }}>
                    Start Chat
                </button>
            </div>
        );
    }

    return (
        <div style={{ textAlign: "center", padding: "20px" }}>
            <h2>📡 SignalR Real-Time Chat ({userId})</h2>
            <div style={{ marginBottom: "10px" }}>
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    style={{ padding: "10px", width: "250px" }}
                />
                <button onClick={sendMessage} style={{ marginLeft: "10px", padding: "10px 15px" }}>
                    Send
                </button>
            </div>

            <div style={{
                border: "1px solid gray",
                padding: "10px",
                width: "400px",
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "#f9f9f9",
                borderRadius: "5px"
            }}>
                <h4>Messages</h4>
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        style={{
                            alignSelf: msg.sender === userId ? "flex-end" : "flex-start",
                            backgroundColor: msg.sender === userId ? "#4CAF50" : "#007bff",
                            color: "white",
                            padding: "10px",
                            borderRadius: "10px",
                            maxWidth: "70%",
                            textAlign: msg.sender === userId ? "right" : "left"
                        }}
                    >
                        <strong>{msg.sender === userId ? "You" : msg.sender}:</strong> {msg.msg}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SignalRChat;
