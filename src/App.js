import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Clock, Trash2, Plus, Send, Paperclip, X, Download, Clock3, AlertTriangle } from 'lucide-react'; // Added Download, Clock3, and AlertTriangle icons

// --- Configuration ---
// IMPORTANT: Replace 'localhost' with your computer's local IP address
// when accessing from other devices on your network (like your phone).
// Example: 'http://192.168.1.100:5000/api'
// const local_ip = '192.168.2.146'
const local_ip = 'localhost'
const API_BASE_URL = 'http://localhost:5000/api'; // Change 'localhost' to your IP for phone access

// --- Helper Components ---

// Simple Modal Component
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto p-4"> {/* Added overflow-y-auto and p-4 for mobile */}
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-auto relative"> {/* Changed m-4 to m-auto for better centering */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
};

// Alert Message Component
const AlertMessage = ({ message, type, onClose }) => {
  if (!message) return null;

  const bgColor = type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-green-100 border-green-400 text-green-700';
  const Icon = type === 'error' ? AlertCircle : CheckCircle;

  return (
    <div className={`border rounded-md p-3 mb-4 flex items-center justify-between ${bgColor}`} role="alert">
      <div className="flex items-center">
        <Icon size={20} className="mr-2" />
        <span className="block sm:inline">{message}</span>
      </div>
      <button onClick={onClose} className="ml-2">
        <X size={18} />
      </button>
    </div>
  );
};

// Loading Spinner
const Spinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

// --- Main Application Component ---
function App() {
  const [capsules, setCapsules] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // State for viewing capsule details
  const [selectedCapsule, setSelectedCapsule] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);


  // Form State
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendDate, setSendDate] = useState('');
  const [attachment, setAttachment] = useState(null); // File object
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- API Interaction Functions ---

  const fetchCapsules = useCallback(async () => {
    setIsLoading(true);
    // Don't clear errors/success messages on auto-refresh, only on user action
    // setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/capsules`);
      if (!response.ok) {
        // Only set error if it's a new error, don't overwrite existing ones from user actions
        if (!error) {
            setError(`HTTP error! status: ${response.status}`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Sort capsules, e.g., by send date or creation date
      data.sort((a, b) => new Date(a.send_datetime) - new Date(b.send_datetime));
      setCapsules(data);
      // Clear fetch-related errors on success
      if (error && error.includes('Failed to load capsules')) {
           setError(null);
      }
    } catch (e) {
      console.error("Failed to fetch capsules:", e);
      // Only set error if it's a new error, don't overwrite existing ones from user actions
      if (!error) {
         setError('Failed to load capsules. Please check your connection or try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [error]); // Added error to dependency array to prevent infinite loop if fetch fails repeatedly

  const addCapsule = async (capsuleData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      // Use FormData to handle file uploads
      const formData = new FormData();
      formData.append('recipient_email', capsuleData.recipientEmail);
      formData.append('subject', capsuleData.subject);
      formData.append('body', capsuleData.messageBody);
      formData.append('send_datetime', capsuleData.sendDate); // Ensure backend expects ISO format
      if (capsuleData.attachment) {
        formData.append('attachment', capsuleData.attachment);
      }

      const response = await fetch(`${API_BASE_URL}/capsules`, {
        method: 'POST',
        body: formData, // Send FormData
        // 'Content-Type' header is automatically set by the browser for FormData
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ detail: 'Unknown error occurred' }));
         // Use the 'detail' message from the backend for specific errors
         throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const newCapsule = await response.json();
      // Add new capsule and re-sort
      setCapsules(prev => [...prev, newCapsule].sort((a, b) => new Date(a.send_datetime) - new Date(b.send_datetime)));
      setSuccessMessage('Time capsule created successfully!');
      resetForm();
      setIsFormModalOpen(false); // Close modal on success
      // No need to force fetch here, the interval will pick it up
    } catch (e) {
      console.error("Failed to add capsule:", e);
      // Display the specific error message from the backend or a generic one
      setError(`Failed to create capsule: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteCapsule = async (id) => {
    // Optional: Add confirmation dialog here
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/capsules/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error occurred' }));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      setCapsules(prev => prev.filter(capsule => capsule.id !== id));
      setSuccessMessage('Capsule deleted successfully!');
      // No need to force fetch here, the interval will pick it up
    } catch (e) {
      console.error("Failed to delete capsule:", e);
      setError(`Failed to delete capsule: ${e.message}`);
    }
  };

  // --- Effects ---

  // Effect to fetch capsules on component mount and set up auto-refresh
  useEffect(() => {
    fetchCapsules(); // Initial fetch

    // Set up interval to fetch capsules every minute (60000 milliseconds)
    const intervalId = setInterval(fetchCapsules, 60000); // Fetch every 60 seconds

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, [fetchCapsules]); // Dependency array includes fetchCapsules

  // --- Event Handlers ---

  const handleFormSubmit = (e) => {
    e.preventDefault();
    // Basic validation (more robust validation is recommended)
    if (!recipientEmail || !subject || !messageBody || !sendDate) {
        setError("Please fill in all required fields.");
        return;
    }
    // Validate date is in the future
    const now = new Date();
    const selectedDate = new Date(sendDate);
    if (selectedDate <= now) {
        setError("Sending date must be in the future.");
        return;
    }

    addCapsule({ recipientEmail, subject, messageBody, sendDate, attachment });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Optional: Add file size validation
      // const maxSize = 5 * 1024 * 1024; // 5MB example limit
      // if (file.size > maxSize) {
      //   setError('File size exceeds the limit (e.g., 5MB).');
      //   setAttachment(null);
      //   e.target.value = null; // Clear the input
      //   return;
      // }
      setAttachment(file);
      setError(null); // Clear previous file errors
    } else {
      setAttachment(null);
    }
  };

  const resetForm = () => {
    setRecipientEmail('');
    setSubject('');
    setMessageBody('');
    setSendDate('');
    setAttachment(null);
    // If using a file input ref, reset it: fileInputRef.current.value = null;
  };

  const closeAlerts = () => {
      setError(null);
      setSuccessMessage(null);
  }

  // Handler to open the detail modal
  const openDetailModal = (capsule) => {
    setSelectedCapsule(capsule);
    setIsDetailModalOpen(true);
  };

  // Handler to close the detail modal
  const closeDetailModal = () => {
    setSelectedCapsule(null);
    setIsDetailModalOpen(false);
  };

  // Handler to fill the send date with current time + 1 minute
  const handleFillCurrentTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1); // Add 1 minute
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    // Format asYYYY-MM-DDTHH:mm which is required by datetime-local input
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    setSendDate(formattedDateTime);
  };


  // --- Rendering ---

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Use toLocaleString for user-friendly format, it handles timezones based on browser settings
      return new Date(dateString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  // Get current date inYYYY-MM-DDTHH:mm format for min attribute of datetime-local
   const getMinDateTime = () => {
    const now = new Date();
    // Add a small buffer (e.g., 1 minute) to ensure the selected time is strictly in the future
    now.setMinutes(now.getMinutes() + 1);
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans p-4 md:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-indigo-700">Time Capsule</h1>
        <p className="text-lg text-gray-600 mt-2">Send messages to the future</p>
      </header>

      <main className="max-w-4xl mx-auto">
        {/* Global Alerts */}
        <AlertMessage message={error} type="error" onClose={closeAlerts} />
        <AlertMessage message={successMessage} type="success" onClose={closeAlerts} />

        {/* Add Capsule Button */}
        <div className="text-center mb-6">
          <button
            onClick={() => setIsFormModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-300 ease-in-out inline-flex items-center"
          >
            <Plus size={20} className="mr-2" />
            Create New Capsule
          </button>
        </div>

        {/* Capsules List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">Scheduled Capsules</h2>
          {isLoading ? (
            <Spinner />
          ) : capsules.length === 0 ? (
            <p className="text-gray-500 text-center">No time capsules scheduled yet. Create one!</p>
          ) : (
            <ul className="space-y-4">
              {capsules.map((capsule) => (
                // Make the list item clickable
                <li
                  key={capsule.id}
                  className={`border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-gray-50 transition duration-150 cursor-pointer ${capsule.status === 'failed' ? 'border-red-300 bg-red-50' : ''}`} // Highlight failed capsules
                  onClick={() => openDetailModal(capsule)} // Added onClick handler
                >
                  <div className="flex-1 mb-3 sm:mb-0">
                    <p className="font-semibold text-indigo-700">{capsule.subject}</p>
                    <p className="text-sm text-gray-600">To: {capsule.recipient_email}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Scheduled for: {formatDate(capsule.send_datetime)}
                    </p>
                     {/* Display attachment info if available */}
                     {capsule.attachment_filename && (
                        <p className="text-sm text-gray-500 mt-1 inline-flex items-center">
                           <Paperclip size={14} className="mr-1" /> {capsule.attachment_filename}
                        </p>
                     )}
                     {/* Display error message if status is failed */}
                     {capsule.status === 'failed' && capsule.error_message && (
                         <p className="text-sm text-red-700 mt-1 inline-flex items-center">
                             <AlertTriangle size={14} className="mr-1" /> Error: {capsule.error_message}
                         </p>
                     )}
                  </div>
                  {/* Delete button remains separate and not part of the clickable area */}
                  <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                     <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center ${
                        capsule.status === 'sent' ? 'bg-green-100 text-green-800' :
                        capsule.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                       {capsule.status === 'sent' ? <CheckCircle size={14} className="mr-1" /> :
                        capsule.status === 'failed' ? <AlertCircle size={14} className="mr-1" /> :
                        <Clock size={14} className="mr-1" />}
                       {capsule.status === 'sent' ? 'Sent' : capsule.status === 'failed' ? 'Failed' : 'Pending'}
                     </span>
                    <button
                      onClick={(e) => {
                         e.stopPropagation(); // Prevent the click from triggering the li onClick
                        if (window.confirm(`Are you sure you want to delete the capsule "${capsule.subject}"?`)) {
                           deleteCapsule(capsule.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition duration-150"
                      aria-label="Delete capsule"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Add/Edit Form Modal */}
      <Modal isOpen={isFormModalOpen} onClose={() => setIsFormModalOpen(false)} title="Create Time Capsule">
         {/* Local error display within the modal */}
         {/* Only show error if it's not a global success message */}
         {error && !successMessage && <AlertMessage message={error} type="error" onClose={() => setError(null)} />}


        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label htmlFor="recipientEmail" className="block text-sm font-medium text-gray-700 mb-1">Recipient Email *</label>
            <input
              type="email"
              id="recipientEmail"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="friend@example.com"
            />
          </div>
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="A message from the past..."
            />
          </div>
          <div>
            <label htmlFor="messageBody" className="block text-sm font-medium text-gray-700 mb-1">Message Body *</label>
            <textarea
              id="messageBody"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              required
              rows="4"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Remember that time when..."
            ></textarea>
          </div>
          <div>
            {/* Container for label, button, and input */}
            <div className="flex items-center justify-between mb-1">
                <label htmlFor="sendDate" className="block text-sm font-medium text-gray-700">Send Date & Time *</label>
                {/* Button to fill with current time + 1 minute */}
                <button
                    type="button" // Important: Use type="button" to prevent form submission
                    onClick={handleFillCurrentTime}
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"
                    aria-label="Fill with current time + 1 minute"
                >
                    <Clock3 size={14} className="mr-1"/> Fill current + 1 min
                </button>
            </div>
            <input
              type="datetime-local"
              id="sendDate"
              value={sendDate}
              onChange={(e) => setSendDate(e.target.value)}
              required
              min={getMinDateTime()} // Prevent selecting past dates
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
             <p className="text-xs text-gray-500 mt-1">Select a date and time in the future.</p>
          </div>
           <div>
            <label htmlFor="attachment" className="block text-sm font-medium text-gray-700 mb-1">Attachment (Optional)</label>
            <input
              type="file"
              id="attachment"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
             {attachment && <p className="text-xs text-gray-600 mt-1">Selected: {attachment.name}</p>}
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setIsFormModalOpen(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-150"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 inline-flex items-center disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner /> <span className="ml-2">Scheduling...</span>
                </>
              ) : (
                <>
                  <Send size={18} className="mr-2" /> Schedule Capsule
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Capsule Details Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        title={selectedCapsule ? selectedCapsule.subject : 'Capsule Details'}
      >
        {selectedCapsule && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Recipient Email:</p>
              <p className="text-gray-900">{selectedCapsule.recipient_email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Scheduled For:</p>
              <p className="text-gray-900">{formatDate(selectedCapsule.send_datetime)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Status:</p>
              <p className={`font-medium ${selectedCapsule.status === 'sent' ? 'text-green-700' :
                 selectedCapsule.status === 'failed' ? 'text-red-700' :
                 'text-yellow-700'}`}>
                 {selectedCapsule.status === 'sent' ? 'Sent' : selectedCapsule.status === 'failed' ? 'Failed' : 'Pending'}
              </p>
            </div>
            {/* Display error message in detail modal if status is failed */}
            {selectedCapsule.status === 'failed' && selectedCapsule.error_message && (
                <div>
                    <p className="text-sm font-medium text-gray-700">Error Details:</p>
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{selectedCapsule.error_message}</p>
                </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-700">Message:</p>
              {/* Use pre-wrap to respect line breaks in the message body */}
              <p className="text-gray-900 whitespace-pre-wrap">{selectedCapsule.body}</p>
            </div>
            {selectedCapsule.attachment_filename && (
              <div>
                <p className="text-sm font-medium text-gray-700">Attachment:</p>
                {/* Link to download the attachment */}
                <a
                  href={`${API_BASE_URL}/capsules/${selectedCapsule.id}/attachment`}
                  target="_blank" // Open in a new tab
                  rel="noopener noreferrer" // Security best practice for target="_blank"
                  className="text-indigo-600 hover:underline inline-flex items-center"
                >
                  <Download size={16} className="mr-1" />
                  {selectedCapsule.attachment_filename}
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>Time Capsule App - Built with React & Flask</p>
      </footer>
    </div>
  );
}

export default App;

// --- Helper Spinner Component (Inline for simplicity) ---
// This component is not used in the main App component anymore,
// but keeping it here in case it's needed elsewhere or for reference.
const SpinnerInline = () => (
  <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
);
