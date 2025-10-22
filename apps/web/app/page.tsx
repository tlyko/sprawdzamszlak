'use client'; 

import { useState, useEffect } from 'react';

const WORKER_URL = "https://gorski-agent.tlyko94.workers.dev";

export default function Home() {
  const [message, setMessage] = useState('Łączenie z API...');

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(WORKER_URL);
        if (!response.ok) {
          throw new Error('Błąd sieci');
        }
        const text = await response.text();
        setMessage(text);
      } catch (error) {
        console.error('Nie udało się pobrać danych:', error);
        setMessage('Nie udało się połączyć z API :(');
      }
    }

    fetchData();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Sprawdzam Szlak</h1>
      <div className="p-6 bg-gray-100 rounded-lg shadow-md">
        <p className="text-lg text-gray-800">
          Odpowiedź z Twojego backendu (Cloudflare Worker):
        </p>
        <p className="text-2xl font-semibold text-blue-600 mt-2">
          {message}
        </p>
      </div>
    </main>
  );
}