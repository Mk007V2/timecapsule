import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Clock, Trash2, Plus, Send, Paperclip, X, Download, Clock3, AlertTriangle, Sparkles } from 'lucide-react';

// --- Configuration ---
// IMPORTANT: Replace 'localhost' with your computer's local IP address
// when accessing from other devices on your network (like your phone).
// Example: 'http://192.168.1.100:5078/api'
const API_BASE_URL = `https://mk007v2.pythonanywhere.com/api`; // Use template literal for easier IP change

// Simple Modal Component
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-auto relative">
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
const Spinner = ({ size = 'h-8 w-8', color = 'border-blue-500' }) => ( // Added size/color props
  <div className="flex justify-center items-center">
    <div className={`animate-spin rounded-full border-t-2 border-b-2 ${size} ${color}`}></div>
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

  // --- AI Generation State ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState(null); // Specific error state for AI generation

  // --- API Interaction Functions ---

  const fetchCapsules = useCallback(async () => {
    setIsLoading(true);
    // Don't clear errors/success messages on auto-refresh, only on user action
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
  }, [error]); // Added error to dependency array

  const addCapsule = async (capsuleData) => {
    setIsSubmitting(true);
    setError(null); // Clear general errors on new submission
    setSuccessMessage(null);
    try {
      const formData = new FormData();
      formData.append('recipient_email', capsuleData.recipientEmail);
      formData.append('subject', capsuleData.subject);
      formData.append('body', capsuleData.messageBody);
      const localDate = new Date(capsuleData.sendDate);
      const utcDateString = localDate.toISOString(); // Always UTC
      formData.append('send_datetime', utcDateString);

      formData.append('send_datetime', capsuleData.sendDate);
      if (capsuleData.attachment) {
        formData.append('attachment', capsuleData.attachment);
      }

      const response = await fetch(`${API_BASE_URL}/capsules`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ detail: 'Unknown error occurred' }));
         throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const newCapsule = await response.json();
      setCapsules(prev => [...prev, newCapsule].sort((a, b) => new Date(a.send_datetime) - new Date(b.send_datetime)));
      setSuccessMessage('Time capsule created successfully!');
      resetForm();
      setIsFormModalOpen(false);
    } catch (e) {
      console.error("Failed to add capsule:", e);
      setError(`Failed to create capsule: ${e.message}`); // Set general error
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteCapsule = async (id) => {
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
    } catch (e) {
      console.error("Failed to delete capsule:", e);
      setError(`Failed to delete capsule: ${e.message}`);
    }
  };

  // --- Simulated AI Letter Generation ---
  const generateLetter = async () => {
      if (!aiPrompt.trim()) {
          setAiError("Please enter a description/prompt for the AI.");
          return;
      }
      setIsGenerating(true);
      setAiError(null); // Clear previous AI errors
      setError(null); // Clear general errors as well
      setSuccessMessage(null); // Clear success messages

      try {
          // --- Simulate API Call Delay ---
          await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds

          // --- Placeholder Generation Logic ---
          // In a real app, replace this with:
          // const response = await fetch('/api/generate-letter', { // Your backend endpoint
          //   method: 'POST',
          //   headers: { 'Content-Type': 'application/json' },
          //   body: JSON.stringify({ prompt: aiPrompt })
          // });
          // if (!response.ok) throw new Error('Failed to generate text from AI.');
          // const data = await response.json();
          // const generatedText = data.letter;

          // --- Simulated Response ---
          const generatedText = `Dearest Future Self (or recipient),\n\nThis is a message inspired by the idea of "${aiPrompt}".\n\nRemember the feeling of [insert relevant feeling, e.g., hope, excitement, nostalgia]? Hold onto that. The world might change, challenges may arise, but the core of what matters often remains.\n\nThink about [mention something related to the prompt, e.g., the possibilities, the lessons learned, the people involved]. May this message find you well and remind you of the journey.\n\nWith anticipation,\n\nYour Past Self (or sender)`;

          setMessageBody(generatedText); // Update the message body state

      } catch (e) {
          console.error("AI Generation failed:", e);
          setAiError(`AI Generation failed: ${e.message}`); // Set specific AI error
      } finally {
          setIsGenerating(false);
      }
  };


  // --- Effects ---

  useEffect(() => {
    fetchCapsules();
    const intervalId = setInterval(fetchCapsules, 10000);
    return () => clearInterval(intervalId);
  }, [fetchCapsules]);

  // --- Event Handlers ---

  const handleFormSubmit = (e) => {
    e.preventDefault();
    // Clear AI error when submitting the main form
    setAiError(null);
    if (!recipientEmail || !subject || !messageBody || !sendDate) {
        setError("Please fill in all required fields.");
        return;
    }
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
      setAttachment(file);
      setError(null);
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
    setAiPrompt(''); // Reset AI prompt as well
    setError(null); // Clear general errors
    setAiError(null); // Clear AI errors
    // fileInputRef.current.value = null; // If using ref
  };

  // Reset form state when closing the modal
  const handleCloseFormModal = () => {
      setIsFormModalOpen(false);
      // Delay reset slightly to avoid visual glitch while modal closes
      setTimeout(resetForm, 300);
  };


  const closeAlerts = () => {
      setError(null);
      setSuccessMessage(null);
      setAiError(null); // Also close AI errors
  }

  const openDetailModal = (capsule) => {
    setSelectedCapsule(capsule);
    setIsDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setSelectedCapsule(null);
    setIsDetailModalOpen(false);
  };

  const handleFillCurrentTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    setSendDate(formattedDateTime);
  };


  // --- Rendering ---

  const formatDate = (dateString) => {
    dateString = dateString+"Z"
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };

   const getMinDateTime = () => {
    const now = new Date();
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
        {/* Prioritize general error/success over AI error for global display */}
        {error && <AlertMessage message={error} type="error" onClose={closeAlerts} />}
        {successMessage && <AlertMessage message={successMessage} type="success" onClose={closeAlerts} />}
        {/* Show AI error globally only if no general error/success */}
        {!error && !successMessage && aiError && <AlertMessage message={aiError} type="error" onClose={closeAlerts} />}


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
          {isLoading && capsules.length === 0 ? ( // Show spinner only on initial load
            <Spinner />
          ) : capsules.length === 0 ? (
            <p className="text-gray-500 text-center">No time capsules scheduled yet. Create one!</p>
          ) : (
            <ul className="space-y-4">
              {capsules.map((capsule) => (
                <li
                  key={capsule.id}
                  className={`border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-gray-50 transition duration-150 cursor-pointer ${capsule.status === 'failed' ? 'border-red-300 bg-red-50' : ''}`}
                  onClick={() => openDetailModal(capsule)}
                >
                  <div className="flex-1 mb-3 sm:mb-0 mr-4"> {/* Added mr-4 for spacing */}
                    <p className="font-semibold text-indigo-700 truncate">{capsule.subject}</p> {/* Added truncate */}
                    <p className="text-sm text-gray-600 truncate">To: {capsule.recipient_email}</p> {/* Added truncate */}
                    <p className="text-sm text-gray-500 mt-1">
                      Scheduled for: {formatDate(capsule.send_datetime)}
                    </p>
                     {capsule.attachment_filename && (
                        <p className="text-sm text-gray-500 mt-1 inline-flex items-center truncate"> {/* Added truncate */}
                           <Paperclip size={14} className="mr-1 flex-shrink-0" /> {capsule.attachment_filename}
                        </p>
                     )}
                     {capsule.status === 'failed' && capsule.error_message && (
                         <p className="text-sm text-red-700 mt-1 inline-flex items-center">
                             <AlertTriangle size={14} className="mr-1 flex-shrink-0" /> Error: {capsule.error_message}
                         </p>
                     )}
                  </div>
                  <div className="flex items-center space-x-3 w-full sm:w-auto justify-end flex-shrink-0"> {/* Added flex-shrink-0 */}
                     <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center whitespace-nowrap ${ // Added whitespace-nowrap
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
                         e.stopPropagation();
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
      {/* Use the new handler for onClose */}
      <Modal isOpen={isFormModalOpen} onClose={handleCloseFormModal} title="Create Time Capsule">
         {/* Local error display within the modal */}
         {/* Show general error first, then AI error if no general error */}
         {error && <AlertMessage message={error} type="error" onClose={() => setError(null)} />}
         {!error && aiError && <AlertMessage message={aiError} type="error" onClose={() => setAiError(null)} />}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Recipient Email */}
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
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            />
          </div>
          {/* Subject */}
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
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            />
          </div>

          {/* --- AI Generation Section --- */}
          <div className="space-y-2 p-3 border border-dashed border-indigo-200 rounded-md bg-indigo-50/50">
             <label htmlFor="aiPrompt" className="block text-sm font-medium text-gray-700">AI Letter Helper</label>
             <div className="flex items-center space-x-2">
                 <input
                    type="text"
                    id="aiPrompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Describe the letter (e.g., 'hope for the future')"
                    disabled={isGenerating || isSubmitting} // Disable during generation or submission
                 />
                 <button
                    type="button" // Prevent form submission
                    onClick={generateLetter}
                    className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-purple-500 transition duration-150 inline-flex items-center text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isGenerating || isSubmitting} // Disable when generating or submitting
                 >
                    {isGenerating ? (
                        <>
                         <Spinner size="h-4 w-4" color="border-white" />
                         <span className="ml-2">Generating...</span>
                        </>
                    ) : (
                        <>
                         <Sparkles size={16} className="mr-1.5" /> Generate
                        </>
                    )}
                 </button>
             </div>
              <p className="text-xs text-gray-500">Enter a theme or idea, and the AI will draft a letter below.</p>
          </div>
          {/* --- End AI Generation Section --- */}

          {/* Message Body */}
          <div>
            <label htmlFor="messageBody" className="block text-sm font-medium text-gray-700 mb-1">Message Body *</label>
            <textarea
              id="messageBody"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              required
              rows="6" // Increased rows slightly
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Write your message here, or use the AI helper above..."
              disabled={isSubmitting} // Only disable during final submission
            ></textarea>
          </div>
          {/* Send Date */}
          <div>
            <div className="flex items-center justify-between mb-1">
                <label htmlFor="sendDate" className="block text-sm font-medium text-gray-700">Send Date & Time *</label>
                <button
                    type="button"
                    onClick={handleFillCurrentTime}
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center disabled:opacity-50"
                    aria-label="Fill with current time + 1 minute"
                    disabled={isSubmitting || isGenerating} // Disable during submission/generation
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
              min={getMinDateTime()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            />
             <p className="text-xs text-gray-500 mt-1">Select a date and time in the future.</p>
          </div>
          {/* Attachment */}
           <div>
            <label htmlFor="attachment" className="block text-sm font-medium text-gray-700 mb-1">Attachment (Optional)</label>
            <input
              type="file"
              id="attachment"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            />
             {attachment && <p className="text-xs text-gray-600 mt-1">Selected: {attachment.name}</p>}
          </div>
          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCloseFormModal} // Use the new handler
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-150 disabled:opacity-50"
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || isGenerating} // Disable during submission/generation
            >
              {isSubmitting ? (
                <>
                  <Spinner size="h-5 w-5" color="border-white"/> <span className="ml-2">Scheduling...</span>
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
              <p className="text-gray-900 break-words">{selectedCapsule.recipient_email}</p> {/* Added break-words */}
            </div>
             <div>
              <p className="text-sm font-medium text-gray-700">Subject:</p>
              <p className="text-gray-900 break-words">{selectedCapsule.subject}</p> {/* Added break-words */}
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
            {selectedCapsule.status === 'failed' && selectedCapsule.error_message && (
                <div>
                    <p className="text-sm font-medium text-gray-700">Error Details:</p>
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{selectedCapsule.error_message}</p>
                </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-700">Message:</p>
              <p className="text-gray-900 whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200">{selectedCapsule.body}</p> {/* Added styling */}
            </div>
            {selectedCapsule.attachment_filename && (
              <div>
                <p className="text-sm font-medium text-gray-700">Attachment:</p>
                <a
                  href={`${API_BASE_URL}/capsules/${selectedCapsule.id}/attachment`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline inline-flex items-center break-all" // Added break-all
                >
                  <Download size={16} className="mr-1 flex-shrink-0" />
                  {selectedCapsule.attachment_filename}
                </a>
              </div>
            )}
             <div className="flex justify-end pt-4">
                 <button
                    type="button"
                    onClick={closeDetailModal}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-150"
                 >
                    Close
                 </button>
             </div>
          </div>
        )}
      </Modal>

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>Time Capsule App - Built with React & Flask</p>
         <p>AI Generation Feature Added (Simulated)</p>
      </footer>
    </div>
  );
}

export default App;
