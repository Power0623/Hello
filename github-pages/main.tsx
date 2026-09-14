import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
