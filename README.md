# Timecapsule
### Currently deployed and running at 
#### Netlify, front-end: https://sparkling-buttercream-f02aae.netlify.app/ 
#### PythonAnyWhere, back-end (API): https://timecapsule-production.up.railway.app//api/capsules
#### This is currently sending emails from my personal email account.
## Description
The Time Capsule App is a web application that allows users to compose messages and schedule them to be sent to a specified email address at a future date and time. It serves as a digital time capsule, enabling users to send thoughts, memories, or files to themselves or others in the future.

The application consists of a React frontend providing a user interface for creating, viewing, and deleting time capsules, and a Flask backend that handles data storage, email scheduling, and file attachments.

I have used Gemini 2.5 Flash to write the most of the code here, so the code can be further optimized and refactored.

## Features
- Create new time capsules with a recipient email, subject, message body, and scheduled sending date/time.

- Optionally attach a file to a time capsule.(5MB limit set in App.js)

- View a list of all scheduled time capsules with their status (Pending/Sent/Failed).

- Click on a capsule in the list to view its full details, including the message body and attachment information.

- Download the attached file from the detail view (for capsules with attachments).

- Delete scheduled time capsules.

- Automatic refresh of the capsule list to show updated statuses.

- Reporting of email sending errors on the web page.

- Quick-fill button for setting the send date/time to the current time + 1 minute.

## Limitations
1. It is currently sending emails from a personal email address by design. Thus, this can not be used too often or by many people.
2. File names need to be without spaces, and in English.
3. Using local storage, S3 could be used to get more space.

### Stack
API on Python Flask, which is running on port 5078 by default. It was suggested that Flask would be the best and easiest option to implementing an API from scratch.
Web app on React, styled using TailWindCSS. I already had some experience with React, so I chose it. It could also be helpful for writing an iOS app.

### UI
Designed using Gemini and TailWindCSS for modern looks.
File size limit is 5MB.
AI button does not use actual AI, cuz I could not integrate free AI tools.

## How to Launch
This project has both a backend (Flask) and a frontend (React). Both need to be set up and running.

Prerequisites
    Python 3.6+ and pip
    Node.js and npm
    A Gmail account (or other SMTP server details) for sending emails. You should use a Gmail App Password if 2-Factor Authentication is enabled.

### 1. Clone repo and navigate to project directory
```
git clone https://github.com/Mk007V2/timecapsule.git
cd timecapsule
```
### 2. Set up API (Flask)
#### 2.1 Create and activate python virtual environment
```
python -m venv venv
. venv/bin/activate
```
#### 2.2 Install dependencies 
```
pip install Flask Flask-SQLAlchemy Flask-APScheduler Flask-Cors python-dotenv pytz werkzeug
```
#### 2.2 Set up env variables
Create .env file in API/ directory beside API.py file with the following text
```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USE_SSL=False
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_generated_app_password # Use a Gmail App Password
```
Replace MAIL_USERNAME, MAIL_PASSWORD with your own login credentials.

#### 2.3 Run python code
```
python API/API.py
```

### 3. Set up Front-end (React)
#### npm install and start
```
npm install
npm start
```

### Done !
Open it in your browser on the same machine.

## Deploy
Procedures are all the same mostly.
In order to deploy, you will need to change "localhost:5078" to your server's IP address.
