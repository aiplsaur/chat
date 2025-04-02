import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Initialize dark mode based on user preference or system preference
const initializeDarkMode = () => {
  // Check if there's a saved theme preference
  const savedTheme = localStorage.getItem('theme');
  
  if (savedTheme === 'dark' || 
     (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

// Run the initialization
initializeDarkMode();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <>
    <App />
  </>
);
