import React from 'react';
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import SignalRChat from "./SignalRChat";
import TextConverterTool from "./TextConverterTool";
import VideoChat from "./VideoChat";
import Header from "./Header";

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen w-full bg-white dark:bg-gray-900 transition-colors duration-200">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<TextConverterTool />} />
            <Route path="/videochat" element={<VideoChat />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
