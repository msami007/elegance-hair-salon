import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminCalendarPage from './pages/AdminCalendarPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/admin" element={<AdminCalendarPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
