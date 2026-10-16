import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import App from './App.jsx';
import { UserProvider } from './context/UserContext.jsx';
import { FeedbackProvider } from './context/Feedback.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        <UserProvider>
          <App />
        </UserProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </React.StrictMode>
);
