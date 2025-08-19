import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

// Main App component
const App = () => {
  // State variables for the app
  const [todos, setTodos] = useState([]);
  const [task, setTask] = useState('');
  const [reminder, setReminder] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationTask, setNotificationTask] = useState('');

  // Refs for tracking reminders
  const reminderTimeouts = useRef({});

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    try {
      // Use the provided global variables for Firebase configuration
      const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          try {
            // Sign in anonymously if no user is found
            if (typeof __initial_auth_token !== 'undefined') {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Error during anonymous sign-in: ", error);
          }
        }
        setUserId(firebaseAuth.currentUser?.uid);
        setIsAuthReady(true);
      });

      // Cleanup auth listener on component unmount
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
    }
  }, []);

  // Set up Firestore snapshot listener for real-time updates
  useEffect(() => {
    if (db && userId) {
      const todosCollectionRef = collection(db, 'artifacts', typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', 'users', userId, 'todos');
      const q = query(todosCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const newTodos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTodos(newTodos);
        // Clear existing reminders and set new ones for the fetched tasks
        clearAllReminders();
        setNewReminders(newTodos);
      }, (error) => {
        console.error("Failed to get Firestore data:", error);
      });

      // Cleanup snapshot listener on component unmount
      return () => unsubscribe();
    }
  }, [db, userId, isAuthReady]);

  // Function to clear all scheduled reminders
  const clearAllReminders = () => {
    Object.values(reminderTimeouts.current).forEach(timeoutId => clearTimeout(timeoutId));
    reminderTimeouts.current = {};
  };

  // Function to set new reminders based on the fetched to-dos
  const setNewReminders = (newTodos) => {
    const now = Date.now();
    newTodos.forEach(todo => {
      if (todo.reminderTime && todo.reminderTime.toMillis() > now) {
        const timeUntilReminder = todo.reminderTime.toMillis() - now;
        const timeoutId = setTimeout(() => {
          triggerReminder(todo.task);
        }, timeUntilReminder);
        reminderTimeouts.current[todo.id] = timeoutId;
      }
    });
  };

  // Function to display the reminder notification
  const triggerReminder = (taskName) => {
    setNotificationTask(taskName);
    setShowNotification(true);
    // Hide the notification after a few seconds
    setTimeout(() => {
      setShowNotification(false);
    }, 5000);
  };

  // Handler for adding a new to-do
  const handleAddTodo = async () => {
    if (task.trim() === '' || !db) return;

    try {
      const todosCollectionRef = collection(db, 'artifacts', typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', 'users', userId, 'todos');

      const newTodo = {
        task: task.trim(),
        completed: false,
        createdAt: new Date(),
      };

      // Add reminder time if it's set
      if (reminder) {
        newTodo.reminderTime = new Date(reminder);
      }

      await addDoc(todosCollectionRef, newTodo);
      setTask('');
      setReminder('');
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  // Handler for marking a to-do as complete or incomplete
  const handleToggleComplete = async (todoId, completed) => {
    if (!db) return;
    try {
      const todoDocRef = doc(db, 'artifacts', typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', 'users', userId, 'todos', todoId);
      await updateDoc(todoDocRef, { completed: !completed });
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  // Handler for deleting a to-do
  const handleDeleteTodo = async (todoId) => {
    if (!db) return;
    try {
      const todoDocRef = doc(db, 'artifacts', typeof __app_id !== 'undefined' ? __app_id : 'default-app-id', 'users', userId, 'todos', todoId);
      await deleteDoc(todoDocRef);
    } catch (e) {
      console.error("Error deleting document: ", e);
    }
  };

  // Render a loading state while Firebase is initializing
  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-pink-100 p-4">
        <div className="text-xl text-gray-700">Loading...</div>
      </div>
    );
  }

  // Render the main application UI
  return (
    <div className="min-h-screen bg-pink-100 flex items-center justify-center p-4 font-inter">
      {/* Main container for the app */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 transform transition-transform duration-300 hover:scale-105">
        <h1 className="text-5xl font-extrabold text-center text-pink-600 mb-6 font-fredoka">
          Pookie To-Dos
        </h1>
        {/* Input area for adding new tasks */}
        <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4 mb-6">
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTodo();
            }}
            placeholder="What's a pookie thing to do?"
            className="flex-grow w-full md:w-auto p-4 rounded-xl border-2 border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-400 text-gray-700 placeholder-pink-300"
          />
          <input
            type="datetime-local"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="p-4 rounded-xl border-2 border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-400 text-gray-700 w-full md:w-auto"
          />
          <button
            onClick={handleAddTodo}
            className="w-full md:w-auto p-4 bg-pink-500 hover:bg-pink-600 text-white rounded-xl shadow-md transition-all duration-300 transform hover:scale-105"
          >
            Add
          </button>
        </div>

        {/* List of to-do items */}
        <ul className="space-y-4">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`flex items-center justify-between p-4 rounded-xl shadow-sm transition-all duration-300 ${
                todo.completed ? 'bg-green-100 border-l-4 border-green-500' : 'bg-blue-100 border-l-4 border-blue-500'
              } transform hover:scale-105`}
            >
              <div className="flex items-center flex-grow">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => handleToggleComplete(todo.id, todo.completed)}
                  className="form-checkbox h-6 w-6 text-pink-500 rounded-md border-2 border-pink-300 cursor-pointer focus:ring-pink-400"
                />
                <span
                  className={`ml-4 text-lg font-medium text-gray-800 ${
                    todo.completed ? 'line-through text-gray-500' : ''
                  }`}
                >
                  {todo.task}
                </span>
                {todo.reminderTime && (
                  <span className="ml-4 text-xs text-gray-500">
                    Remind: {new Date(todo.reminderTime.toDate()).toLocaleString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDeleteTodo(todo.id)}
                className="ml-4 p-2 text-red-400 hover:text-red-600 transition-colors duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        {/* Display the user ID for collaboration purposes */}
        <div className="mt-6 text-center text-xs text-gray-500 break-all">
          User ID: {userId}
        </div>
      </div>

      {/* Reminder notification pop-up */}
      {showNotification && (
        <div className="fixed bottom-8 right-8 bg-pink-500 text-white p-6 rounded-xl shadow-2xl transition-all duration-500 transform scale-100 z-50">
          <h2 className="text-xl font-bold font-fredoka mb-2">Pookie Reminder!</h2>
          <p className="text-lg">It's time to do: <span className="font-semibold">{notificationTask}</span></p>
        </div>
      )}
    </div>
  );
};

// Main component export
export default App;
