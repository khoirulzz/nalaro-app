import React from 'react';
import { createRoot } from 'react-dom/client';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import OrderForm from '../src/components/react/OrderForm';
import '../src/styles/tokens.css';
import '../src/styles/global.css';
import '../src/styles/order.css';

connectFirestoreEmulator(db, '127.0.0.1', 8085);
createRoot(document.getElementById('root')!).render(<OrderForm />);
