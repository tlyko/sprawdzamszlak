'use client'; 

import { useState, useEffect } from 'react';

// IMPORTANT: Paste your URL from `terraform output` here
const AWS_API_URL = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/"; 

export default function Home() {
  // Change state: 'message' (text) to 'data' (will hold JSON data)
  const [data, setData] = useState<any>('Connecting to AWS API...');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Use the new URL
        const response = await fetch(AWS_API_URL); 
        
        if (!response.ok) {
          throw new Error(`Network error: ${response.statusText}`);
        }

        // CHANGE: Parse the response as JSON, not text
        const jsonData = await response.json();
        setData(jsonData); // Save the JSON data in state

      } catch (error) {
        console.error('Failed to fetch data from AWS:', error);
        setData({ error: `Failed to connect to API: ${error}` });
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []); // Empty array [] means "run only once"

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      {/* This is your brand name, you can change it if you like */}
      <h1 className="text-4xl font-bold mb-8">Sprawdzam Szlak</h1>
      
      <div className="p-6 bg-gray-100 rounded-lg shadow-md w-full max-w-2xl">
        <p className="text-lg text-gray-800">
          Response from your backend (AWS Lambda + API Gateway):
        </p>
        
        {/* Display data in <pre> to nicely format the JSON.
          This is just a test to see if the data is arriving.
        */}
        <pre className="text-sm bg-white p-4 mt-4 rounded overflow-auto">
          {isLoading 
            ? "Fetching data..." 
            : JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </main>
  );
}