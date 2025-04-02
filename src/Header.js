import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

function Header() {
  const location = useLocation();
  
  return (
    <header className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 shadow-lg w-full z-10 transition-colors duration-200">
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">Text Converter Tool</div>
          <div className="flex items-center space-x-6">
            <nav className="hidden md:block">
              <ul className="flex space-x-8">
                <li>
                  <Link 
                    to="/" 
                    className={`text-lg transition-all duration-200 ${
                      location.pathname === '/' 
                        ? 'text-blue-600 dark:text-blue-400 font-semibold border-b-2 border-blue-600 dark:border-blue-400' 
                        : 'text-gray-700 dark:text-white hover:text-blue-600 dark:hover:text-blue-300'
                    }`}
                  >
                    Text Converter
                  </Link>
                </li>
                <li>
                  <Link 
                    to="/videochat" 
                    className={`text-lg transition-all duration-200 ${
                      location.pathname === '/videochat' 
                        ? 'text-blue-600 dark:text-blue-400 font-semibold border-b-2 border-blue-600 dark:border-blue-400' 
                        : 'text-gray-700 dark:text-white hover:text-blue-600 dark:hover:text-blue-300'
                    }`}
                  >
                    Video Chat
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="md:hidden flex items-center space-x-4">
              <Link 
                to="/" 
                className={`px-3 py-2 ${
                  location.pathname === '/' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white'
                } rounded-md`}
              >
                Text
              </Link>
              <Link 
                to="/videochat" 
                className={`px-3 py-2 ${
                  location.pathname === '/videochat' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white'
                } rounded-md`}
              >
                Video
              </Link>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header; 