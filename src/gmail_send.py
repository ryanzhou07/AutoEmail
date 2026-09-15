import base64
from email.message import EmailMessage
from googleapiclient.discovery import build

def send_email(creds, to_email, subject, body):
    service = build("gmail", "v1", credentials=creds)

    msg = EmailMessage()
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    return service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
