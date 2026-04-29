import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bootstrap } from './Bootstrap';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing from index.html');

createRoot(rootEl).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
