import os
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from flask_apscheduler import APScheduler
from datetime import datetime, timezone
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import pytz # For timezone handling
import uuid # To generate unique filenames
from werkzeug.utils import secure_filename
from flask_cors import CORS # To allow requests from your React frontend
from dotenv import load_dotenv # Import load_dotenv
from sqlalchemy import inspect # Import inspect
from sqlalchemy.exc import OperationalError # Import specific exception
import logging # Import logging module

# --- Configure basic logging ---
# This helps ensure we see messages even if print() is buffered
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)


# --- Load environment variables from .env file ---
# Make sure this is called at the very beginning to load variables before they are accessed
load_dotenv()
log.info(".env file loaded.")

# --- Flask App Configuration ---
app = Flask(__name__)

# Configure SQLite database
# Using a relative path for the database file
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///' + os.path.join(BASE_DIR, 'time_capsules.db')) # Use DATABASE_URL env var if available
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False # Suppress a warning
log.info(f"SQLALCHEMY_DATABASE_URI set to: {app.config['SQLALCHEMY_DATABASE_URI']}")


# Configure file upload directory
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
# On platforms like Render, the filesystem might be read-only or ephemeral.
# If using local file storage, ensure the directory is writeable or use persistent storage.
# For Render Free tier, local uploads will NOT persist.
os.makedirs(UPLOAD_FOLDER, exist_ok=True) # Create upload directory if it doesn't exist
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Max upload size (e.g., 16MB)
log.info(f"UPLOAD_FOLDER set to: {app.config['UPLOAD_FOLDER']}")


# Configure email sending
# Use environment variables for sensitive info
app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com') # Example: Gmail SMTP server
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587)) # Example: Gmail TLS port
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True').lower() == 'true'
app.config['MAIL_USE_SSL'] = os.environ.get('MAIL_USE_SSL', 'False').lower() == 'true'
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME') # Your email address
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD') # Your email password or app password
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', app.config['MAIL_USERNAME'])
log.info(f"Email configuration loaded. MAIL_SERVER: {app.config['MAIL_SERVER']}, MAIL_USERNAME: {app.config['MAIL_USERNAME']}")


# Configure APScheduler
app.config['SCHEDULER_API_ENABLED'] = False # Disable the built-in API endpoints
scheduler = APScheduler()
log.info("APScheduler initialized.")


# Initialize extensions
db = SQLAlchemy(app)
CORS(app) # Enable CORS for all routes
log.info("SQLAlchemy and CORS initialized.")

# --- Database Model ---
class Capsule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recipient_email = db.Column(db.String(120), nullable=False)
    subject = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    # Store datetime as UTC and convert for display/input
    send_datetime_utc = db.Column(db.DateTime(timezone=True), nullable=False)
    attachment_path = db.Column(db.String(255), nullable=True) # Path to stored file
    attachment_filename = db.Column(db.String(255), nullable=True) # Original filename
    status = db.Column(db.String(20), default='pending') # 'pending', 'sent', or 'failed'
    error_message = db.Column(db.Text, nullable=True) # Store error message if sending fails
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Capsule {self.subject} to {self.recipient_email}>'

    # Helper to convert UTC datetime to a display format (e.g., ISO 8601 for frontend)
    def to_dict(self):
        return {
            'id': self.id,
            'recipient_email': self.recipient_email,
            'subject': self.subject,
            'body': self.body,
            # Convert UTC to ISO format string for frontend
            'send_datetime': self.send_datetime_utc.isoformat() if self.send_datetime_utc else None,
            'attachment_filename': self.attachment_filename,
            'status': self.status,
            'error_message': self.error_message, # Include error message
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# --- Scheduled Email Sending Job ---
def send_scheduled_emails():
    """
    Scheduled job to find pending capsules with a send date in the past
    and send the emails.
    """
    # This log message indicates the function is being called
    log.info("send_scheduled_emails job started.")
    # Use app.app_context() to ensure the database and app config are available
    with app.app_context():
        try:
            # Use timezone-aware datetime for comparison
            now_utc = datetime.now(timezone.utc)
            # print(f"Scheduler running at UTC: {now_utc.isoformat()}") # Keep this for debugging if needed

            # Query for pending capsules where send_datetime_utc is less than or equal to now_utc
            # Also include capsules that previously failed, to potentially retry
            pending_capsules = Capsule.query.filter(
                (Capsule.status == 'pending') | (Capsule.status == 'failed'), # Include failed for retry
                Capsule.send_datetime_utc <= now_utc
            ).all()

            if pending_capsules: # Only print if there are capsules to process
               log.info(f"Found {len(pending_capsules)} pending/failed capsules to process.")
            # else:
               # log.info("Found 0 pending/failed capsules to process.") # Uncomment if you want this log always


            for capsule in pending_capsules:
                try:
                    log.info(f"Attempting to process capsule ID: {capsule.id}, Subject: {capsule.subject}, Scheduled UTC: {capsule.send_datetime_utc.isoformat()}")
                    send_email(capsule)
                    capsule.status = 'sent'
                    capsule.error_message = None # Clear any previous error on success
                    db.session.commit()
                    log.info(f"Successfully sent capsule ID: {capsule.id}")
                except Exception as e:
                    # Log the error and update status and error message in DB
                    log.error(f"Failed to send email for capsule ID {capsule.id}: {e}")
                    capsule.status = 'failed'
                    capsule.error_message = str(e) # Store the error message
                    db.session.commit() # Commit the status and error message update
                    # No rollback here, as we want to save the failed status and error message
                    # db.session.rollback() # Rollback session in case of error during commit (less likely here)

        except OperationalError as e:
             log.error(f"Database Operational Error in scheduler job: {e}")
             db.session.rollback() # Rollback in case of DB error
        except Exception as e:
            log.error(f"An unexpected error occurred in scheduler job: {e}")
            # Ensure session is clean even for unexpected errors
            if db.session.dirty or db.session.pending or db.session.deleted:
                 db.session.rollback()


def send_email(capsule):
    """
    Sends an email for a given capsule object.
    """
    if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
        raise EnvironmentError("Email credentials not configured. Cannot send email.")

    msg = MIMEMultipart()
    msg['From'] = app.config['MAIL_DEFAULT_SENDER']
    msg['To'] = capsule.recipient_email
    msg['Subject'] = capsule.subject

    # Attach body
    msg.attach(MIMEText(capsule.body, 'plain'))

    # Attach file if exists
    if capsule.attachment_path and os.path.exists(capsule.attachment_path):
        try:
            with open(capsule.attachment_path, 'rb') as f:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
            encoders.encode_base64(part)
            # Use the original filename for the attachment in the email
            part.add_header(
                'Content-Disposition',
                f'attachment; filename="{capsule.attachment_filename}"',
            )
            msg.attach(part)
            log.info(f"Attached file: {capsule.attachment_filename}")
        except Exception as e:
            log.error(f"Error attaching file {capsule.attachment_filename}: {e}")
            # Decide how to handle attachment errors - skip sending, send without attachment, etc.
            # For now, we'll raise the exception to fail the send for this capsule.
            raise

    try:
        # Use a context manager for the SMTP server
        with smtplib.SMTP(app.config['MAIL_SERVER'], app.config['MAIL_PORT']) as server:
            server.ehlo() # Can be omitted
            if app.config['MAIL_USE_TLS']:
                 server.starttls() # Secure the connection
                 server.ehlo() # Can be omitted

            if app.config['MAIL_USE_SSL']:
                 # If using SSL, need a different server object
                 server = smtplib.SMTP_SSL(app.config['MAIL_SERVER'], app.config['MAIL_PORT'])


            server.login(app.config['MAIL_USERNAME'], app.config['MAIL_PASSWORD'])
            text = msg.as_string()
            server.sendmail(app.config['MAIL_DEFAULT_SENDER'], capsule.recipient_email, text)
            # server.quit() # Not needed with context manager

        log.info("Email sent successfully!")
    except Exception as e:
        log.error(f"SMTP error occurred: {e}")
        raise # Re-raise the exception to be caught by the scheduler job

# --- API Endpoints ---

@app.route('/api/capsules', methods=['POST'])
def create_capsule():
    """
    Creates a new time capsule.
    Expects form-data with: recipient_email, subject, body, send_datetime, and optionally attachment.
    """
    try:
        # Get form data
        recipient_email = request.form.get('recipient_email')
        subject = request.form.get('subject')
        body = request.form.get('body')
        send_datetime_str = request.form.get('send_datetime') # Expected ISO 8601 format from frontend
        attachment_file = request.files.get('attachment') # Get the file object

        # Basic validation
        if not recipient_email or not subject or not body or not send_datetime_str:
            log.warning("Missing required fields in capsule creation.")
            return jsonify({'detail': 'Missing required fields'}), 400

        # Validate and parse send_datetime
        try:
            # Assume frontend sends datetime-local format which isYYYY-MM-DDTHH:mm
            # We need to parse it and store it as UTC
            send_datetime_local = datetime.fromisoformat(send_datetime_str)
            # print(f"Received send_datetime_str: {send_datetime_str}") # Keep for debugging
            # print(f"Parsed send_datetime_local: {send_datetime_local}") # Keep for debugging

            # Simple approach: assume local time and convert to UTC
            # A more robust approach would involve sending timezone info from frontend
            local_timezone_name = app.config.get('LOCAL_TIMEZONE', 'UTC')
            try:
                 local_timezone = pytz.timezone(local_timezone_name)
            except pytz.UnknownTimeZoneError:
                 log.warning(f"Unknown timezone '{local_timezone_name}'. Defaulting to UTC.")
                 local_timezone = pytz.timezone('UTC')

            send_datetime_aware_local = local_timezone.localize(send_datetime_local)
            send_datetime_utc = send_datetime_aware_local.astimezone(timezone.utc)

            # print(f"Assumed local timezone: {local_timezone_name}") # Keep for debugging
            # print(f"Localized local datetime: {send_datetime_aware_local}") # Keep for debugging
            # print(f"Converted send_datetime_utc: {send_datetime_utc}") # Keep for debugging


            # Check if date is in the future
            now_utc = datetime.now(timezone.utc) # Use timezone-aware datetime
            # print(f"Current UTC time: {now_utc}") # Keep for debugging
            # This check is primarily for immediate feedback in the API response
            # The scheduler's comparison is the final authority for sending
            if send_datetime_utc <= now_utc:
                 log.warning("Received a send date that is not in the future (based on server's interpretation).")
                 # You might want to return an error here for better UX feedback:
                 # return jsonify({'detail': 'Sending date must be in the future.'}), 400


        except ValueError:
            log.error(f"ValueError parsing send_datetime: {send_datetime_str}")
            return jsonify({'detail': 'Invalid send_datetime format. UseYYYY-MM-DDTHH:mm.'}), 400


        attachment_path = None
        attachment_filename = None

        # Handle file upload
        if attachment_file:
            if attachment_file.filename == '':
                log.warning("No selected file for attachment.")
                return jsonify({'detail': 'No selected file for attachment'}), 400

            # Secure the filename and generate a unique name to prevent conflicts
            original_filename = secure_filename(attachment_file.filename)
            unique_filename = str(uuid.uuid4()) + '_' + original_filename
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

            try:
                attachment_file.save(file_path)
                attachment_path = file_path
                attachment_filename = original_filename # Store original name for email
                log.info(f"File saved successfully: {file_path}")
            except Exception as e:
                log.error(f"Error saving file: {e}")
                return jsonify({'detail': f'Failed to save attachment: {e}'}), 500

            # --- Firebase/S3 Integration Note ---
            # Instead of saving locally, you would upload the file to Firebase Storage or S3 here.
            # After successful upload, store the file URL or reference in the database
            # instead of `attachment_path`. You would also need to handle deletion
            # from cloud storage when a capsule is deleted.
            # Example (pseudo-code for Firebase):
            # try:
            #     bucket = storage.bucket()
            #     blob = bucket.blob(f'attachments/{unique_filename}')
            #     blob.upload_from_filename(file_path)
            #     attachment_url = blob.public_url # Or use signed URLs for private storage
            #     attachment_path = attachment_url # Store URL in DB
            #     os.remove(file_path) # Remove local temporary file
            # except Exception as e:
            #     print(f"Error uploading to Firebase: {e}")
            #     # Clean up locally saved file if upload fails
            #     if os.path.exists(file_path):
            #          os.remove(file_path)
            #     return jsonify({'detail': f'Failed to upload attachment: {e}'}), 500
            # ------------------------------------


        # Create new capsule instance
        new_capsule = Capsule(
            recipient_email=recipient_email,
            subject=subject,
            body=body,
            send_datetime_utc=send_datetime_utc,
            attachment_path=attachment_path,
            attachment_filename=attachment_filename,
            status='pending',
            error_message=None # Initialize error message as None
        )

        # Add to database and commit
        db.session.add(new_capsule)
        db.session.commit()
        log.info(f"Capsule created with ID: {new_capsule.id}, Stored UTC: {new_capsule.send_datetime_utc.isoformat()}")

        return jsonify(new_capsule.to_dict()), 201 # 201 Created

    except Exception as e:
        db.session.rollback() # Rollback changes in case of error
        log.error(f"Error creating capsule: {e}")
        # Return a generic error message for unexpected errors
        return jsonify({'detail': f'An internal error occurred: {e}'}), 500

@app.route('/api/capsules', methods=['GET'])
def get_capsules():
    """
    Retrieves all time capsules.
    """
    try:
        capsules = Capsule.query.all()
        # Convert list of Capsule objects to list of dictionaries
        return jsonify([capsule.to_dict() for capsule in capsules]), 200
    except Exception as e:
        log.error(f"Error fetching capsules: {e}")
        return jsonify({'detail': 'Failed to retrieve capsules.'}), 500

@app.route('/api/capsules/<int:capsule_id>', methods=['DELETE'])
def delete_capsule(capsule_id):
    """
    Deletes a specific time capsule by ID.
    """
    try:
        capsule = Capsule.query.get(capsule_id)
        if capsule is None:
            log.warning(f"Delete request for non-existent capsule ID: {capsule_id}")
            return jsonify({'detail': 'Capsule not found'}), 404

        # If using local storage, delete the associated file
        if capsule.attachment_path and os.path.exists(capsule.attachment_path):
            try:
                os.remove(capsule.attachment_path)
                log.info(f"Deleted attachment file: {capsule.attachment_path}")
            except Exception as e:
                log.warning(f"Warning: Failed to delete attachment file {capsule.attachment_path}: {e}")
                # Continue with deleting the database record even if file deletion fails

        # --- Firebase/S3 Integration Note ---
        # If using cloud storage, delete the file from the cloud storage bucket here.
        # Example (pseudo-code for Firebase):
        # try:
        #     bucket = storage.bucket()
        #     blob = bucket.blob(f'attachments/{os.path.basename(capsule.attachment_path)}') # Assuming path stores filename
        #     blob.delete()
        #     print(f"Deleted attachment from Firebase: {capsule.attachment_path}")
        # except Exception as e:
        #      print(f"Warning: Failed to delete attachment from Firebase {capsule.attachment_path}: {e}")
        # ------------------------------------


        db.session.delete(capsule)
        db.session.commit()
        log.info(f"Deleted capsule ID: {capsule_id}")

        return jsonify({'message': 'Capsule deleted successfully'}), 200

    except Exception as e:
        db.session.rollback() # Rollback changes in case of error
        log.error(f"Error deleting capsule {capsule_id}: {e}")
        return jsonify({'detail': 'Failed to delete capsule.'}), 500

# --- Endpoint to Serve Attachments ---
@app.route('/api/capsules/<int:capsule_id>/attachment', methods=['GET'])
def download_attachment(capsule_id):
    """
    Serves the attachment file for a specific capsule ID.
    """
    log.info(f"Attempting to serve attachment for capsule ID: {capsule_id}")
    try:
        capsule = Capsule.query.get(capsule_id)
        if capsule is None:
            log.warning(f"Attachment download: Capsule ID {capsule_id} not found.")
            abort(404, description="Capsule not found")

        log.info(f"Attachment download: Found capsule {capsule.subject}")
        log.info(f"Attachment download: Attachment path stored: {capsule.attachment_path}")

        if not capsule.attachment_path:
             log.warning(f"Attachment download: Capsule ID {capsule_id} has no attachment_path stored.")
             abort(404, description="Attachment not found for this capsule")

        # Check if the file actually exists on the filesystem
        if not os.path.exists(capsule.attachment_path):
             log.warning(f"Attachment download: Attachment file not found on disk at path: {capsule.attachment_path}")
             abort(404, description="Attachment file not found")


        # Ensure the file is within the configured upload folder for security
        # This prevents directory traversal attacks
        # Get the absolute path of the stored file
        abs_attachment_path = os.path.abspath(capsule.attachment_path)
        # Get the absolute path of the upload folder
        abs_upload_folder = os.path.abspath(app.config['UPLOAD_FOLDER'])

        log.info(f"Attachment download: Absolute attachment path: {abs_attachment_path}")
        log.info(f"Attachment download: Absolute upload folder: {abs_upload_folder}")

        if not abs_attachment_path.startswith(abs_upload_folder):
            log.error(f"Security Warning: Attempted to access file outside upload folder: {capsule.attachment_path}")
            abort(403, description="Cannot access this file") # Forbidden

        # Use send_from_directory to serve the file
        # directory is the folder containing the file
        # path is the filename relative to the directory
        directory = os.path.dirname(abs_attachment_path) # Use absolute path for directory
        filename = os.path.basename(abs_attachment_path) # Use absolute path for filename

        log.info(f"Attachment download: Serving file from directory: {directory}")
        log.info(f"Attachment download: Serving filename: {filename}")
        log.info(f"Attachment download: Download name: {capsule.attachment_filename}")


        # Use the original filename for the download
        return send_from_directory(directory, filename, as_attachment=True, download_name=capsule.attachment_filename)

    except Exception as e:
        log.error(f"An unexpected error occurred while serving attachment for capsule {capsule_id}: {e}")
        # Use error.description if it's an HTTPException, otherwise provide a generic message
        error_detail = getattr(e, 'description', 'Failed to serve attachment due to an internal error.')
        abort(500, description=error_detail)


# --- Error Handlers ---
@app.errorhandler(404)
def not_found_error(error):
    # Use error.description if available (set by abort)
    log.warning(f"404 Not Found: {error.description}")
    return jsonify({'detail': error.description or 'Not Found'}), 404

@app.errorhandler(405)
def method_not_allowed_error(error):
    log.warning(f"405 Method Not Allowed: {error}")
    return jsonify({'detail': 'Method Not Allowed'}), 405

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback() # Ensure session is clean on internal errors
    log.error(f"500 Internal Server Error: {error}")
    return jsonify({'detail': error.description or 'Internal Server Error'}), 500

# --- Setup and Running ---

# Move scheduler initialization and start outside the if __name__ == '__main__': block
# This ensures it runs when the module is imported by Gunicorn
try:
    scheduler.init_app(app)
    # The scheduler trigger is set to run every 1 minute for testing purposes.
    # You might want to adjust this interval in a production environment.
    scheduler.add_job(id='send_emails_job', func=send_scheduled_emails, trigger='interval', minutes=1)
    scheduler.start()
    log.info("Scheduler initialized and started successfully.")
except Exception as e:
    log.error(f"Failed to initialize or start scheduler: {e}")


if __name__ == '__main__':
    log.info("Application starting in development mode...")
    # Create database tables if they don't exist
    with app.app_context():
        log.info("Checking database tables...")
        # Check if the 'error_message' column exists and add it if not
        # This is a simple migration strategy for adding a new column
        inspector = inspect(db.engine) # Correctly get the inspector
        # Check if the 'capsule' table exists before trying to get columns
        try:
            if inspector.has_table('capsule'):
                log.info("Table 'capsule' exists. Checking columns...")
                # Get a list of column names in the 'capsule' table
                existing_columns = [col['name'] for col in inspector.get_columns('capsule')]
                if 'error_message' not in existing_columns:
                    log.info("Adding 'error_message' column to the 'capsule' table.")
                    with db.engine.connect() as connection:
                        # Use text() for raw SQL statements
                        connection.execute(db.text('ALTER TABLE capsule ADD COLUMN error_message TEXT'))
                    log.info("Added 'error_message' column successfully.")
                else:
                     log.info("'error_message' column already exists.")
            else:
                 log.info("Table 'capsule' does not exist yet. It will be created by db.create_all().")

            db.create_all() # Ensure all tables (including the updated one) are created
            log.info("Database tables checked/created.")

        except OperationalError as e:
             log.error(f"Database Operational Error during setup: {e}")
             # This might happen if the database URL is incorrect or DB is not accessible
        except Exception as e:
            log.error(f"An unexpected error occurred during database setup: {e}")


    # Run the Flask development server
    # In production, use a production-ready WSGI server like Gunicorn or uWSGI
    # This block is only executed when running 'python API/API.py' directly
    log.info("Running Flask development server...")
    # Note: In a production environment like Render, this app.run() call is ignored
    # and Gunicorn serves the application.
    app.run(debug=True, host='0.0.0.0', port=os.environ.get('PORT', 5078)) # Use PORT env var if available

