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
import uuid
from werkzeug.utils import secure_filename
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import inspect
import logging

# --- Configure basic logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

# --- Load environment variables ---
load_dotenv()

# --- Flask app Configuration ---
app = Flask(__name__)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'time_capsules.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True').lower() == 'true'
app.config['MAIL_USE_SSL'] = os.environ.get('MAIL_USE_SSL', 'False').lower() == 'true'
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', app.config['MAIL_USERNAME'])

app.config['SCHEDULER_API_ENABLED'] = False
scheduler = APScheduler()

# --- Initialize extensions ---
db = SQLAlchemy(app)
CORS(app)

# --- Database Model ---
class Capsule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recipient_email = db.Column(db.String(120), nullable=False)
    subject = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    send_datetime_utc = db.Column(db.DateTime(timezone=True), nullable=False)
    attachment_path = db.Column(db.String(255), nullable=True)
    attachment_filename = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default='pending')
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'recipient_email': self.recipient_email,
            'subject': self.subject,
            'body': self.body,
            'send_datetime': self.send_datetime_utc.isoformat() if self.send_datetime_utc else None,
            'attachment_filename': self.attachment_filename,
            'status': self.status,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# --- Email Sending ---
def send_email(capsule):
    if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
        raise EnvironmentError("Email credentials not configured.")

    msg = MIMEMultipart()
    msg['From'] = app.config['MAIL_DEFAULT_SENDER']
    msg['To'] = capsule.recipient_email
    msg['Subject'] = capsule.subject
    msg.attach(MIMEText(capsule.body, 'plain'))

    if capsule.attachment_path and os.path.exists(capsule.attachment_path):
        with open(capsule.attachment_path, 'rb') as f:
            part = MIMEBase('application', 'octet-stream')
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{capsule.attachment_filename}"')
        msg.attach(part)

    try:
        if app.config['MAIL_USE_SSL']:
            server = smtplib.SMTP_SSL(app.config['MAIL_SERVER'], app.config['MAIL_PORT'])
        else:
            server = smtplib.SMTP(app.config['MAIL_SERVER'], app.config['MAIL_PORT'])
            if app.config['MAIL_USE_TLS']:
                server.starttls()

        server.login(app.config['MAIL_USERNAME'], app.config['MAIL_PASSWORD'])
        server.sendmail(msg['From'], msg['To'], msg.as_string())
        server.quit()
    except Exception as e:
        raise e

# --- Scheduled Task ---
def send_scheduled_emails():
    log.info("send_scheduled_emails job started.")
    with app.app_context():
        now_utc = datetime.now(timezone.utc)

        pending_capsules = Capsule.query.filter(
            (Capsule.status.in_(['pending', 'failed'])) &
            (Capsule.send_datetime_utc <= now_utc)
        ).all()

        

        for capsule in pending_capsules:
            try:
                send_email(capsule)
                capsule.status = 'sent'
                capsule.error_message = None
                db.session.commit()
            except Exception as e:
                capsule.status = 'failed'
                capsule.error_message = str(e)
                db.session.commit()

# --- API Endpoints ---
@app.route('/api/capsules', methods=['POST'])
def create_capsule():
    try:
        recipient_email = request.form.get('recipient_email')
        subject = request.form.get('subject')
        body = request.form.get('body')
        send_datetime_str = request.form.get('send_datetime')
        attachment_file = request.files.get('attachment')

        if not all([recipient_email, subject, body, send_datetime_str]):
            return jsonify({'detail': 'Missing required fields'}), 400

        try:
            send_datetime_utc = datetime.fromisoformat(send_datetime_str)
            if send_datetime_utc.tzinfo is None:
                send_datetime_utc = send_datetime_utc.replace(tzinfo=timezone.utc)
            else:
                send_datetime_utc = send_datetime_utc.astimezone(timezone.utc)

            if send_datetime_utc <= datetime.now(timezone.utc):
                return jsonify({'detail': 'Sending date must be in the future.'}), 400
        except ValueError:
            return jsonify({'detail': 'Invalid send_datetime format.'}), 400

        attachment_path = None
        attachment_filename = None

        if attachment_file:
            original_filename = secure_filename(attachment_file.filename)
            unique_filename = str(uuid.uuid4()) + '_' + original_filename
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            attachment_file.save(file_path)
            attachment_path = file_path
            attachment_filename = original_filename

        new_capsule = Capsule(
            recipient_email=recipient_email,
            subject=subject,
            body=body,
            send_datetime_utc=send_datetime_utc,
            attachment_path=attachment_path,
            attachment_filename=attachment_filename
        )

        db.session.add(new_capsule)
        db.session.commit()

        return jsonify(new_capsule.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'detail': str(e)}), 500

@app.route('/api/capsules', methods=['GET'])
def get_capsules():
    try:
        capsules = Capsule.query.all()
        return jsonify([capsule.to_dict() for capsule in capsules]), 200
    except Exception as e:
        return jsonify({'detail': str(e)}), 500

@app.route('/api/capsules/<int:capsule_id>', methods=['DELETE'])
def delete_capsule(capsule_id):
    try:
        capsule = Capsule.query.get(capsule_id)
        if capsule is None:
            return jsonify({'detail': 'Capsule not found'}), 404

        if capsule.attachment_path and os.path.exists(capsule.attachment_path):
            os.remove(capsule.attachment_path)

        db.session.delete(capsule)
        db.session.commit()
        return jsonify({'message': 'Capsule deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'detail': str(e)}), 500

@app.route('/api/capsules/<int:capsule_id>/attachment', methods=['GET'])
def download_attachment(capsule_id):
    try:
        capsule = Capsule.query.get(capsule_id)
        if capsule is None or not capsule.attachment_path or not os.path.exists(capsule.attachment_path):
            abort(404, description="Attachment not found")

        return send_from_directory(
            directory=os.path.dirname(capsule.attachment_path),
            path=os.path.basename(capsule.attachment_path),
            as_attachment=True,
            download_name=capsule.attachment_filename
        )
    except Exception as e:
        abort(500, description=str(e))

# --- Setup and Running ---
if __name__ == '__main__':
    with app.app_context():
        inspector = inspect(db.engine)
        if not inspector.has_table('capsule'):
            db.create_all()

    try:
        scheduler.init_app(app)
        scheduler.add_job(id='send_emails_job', func=send_scheduled_emails, trigger='interval', seconds=20)
        scheduler.start()
    except Exception as e:
        log.error(f"Scheduler error: {e}")

    app.run(debug=True, host='0.0.0.0', port=5078)
