import os
import random
import sib_api_v3_sdk

from dotenv import load_dotenv
from sib_api_v3_sdk.rest import ApiException

load_dotenv()

# Configure Brevo
configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = os.getenv("BREVO_API_KEY")

api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
    sib_api_v3_sdk.ApiClient(configuration)
)


def generate_otp():
    otp = str(random.randint(100000, 999999))
    return otp


def send_otp_email(receiver_email):

    # Generate OTP
    otp = generate_otp()

    # Professional HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>

    <body style="
        margin: 0;
        padding: 40px 15px;
        background-color: #eef3fc;
        font-family: Arial, Helvetica, sans-serif;
    ">

        <div style="
            max-width: 480px;
            margin: auto;
            background-color: #ffffff;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 8px 35px rgba(30, 60, 120, 0.12);
        ">

            <!-- Header -->
            <div style="
                padding: 30px 20px;
                text-align: center;
                background: linear-gradient(120deg, #2563eb, #7045e8);
            ">

                <h1 style="
                    margin: 0;
                    color: white;
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: -1px;
                ">
                    Chat++
                </h1>

                <p style="
                    margin: 8px 0 0;
                    color: #e0eaff;
                    font-size: 13px;
                    letter-spacing: 2px;
                ">
                    YOUR AI ASSISTANT
                </p>

            </div>


            <!-- Main content -->
            <div style="
                padding: 35px 30px;
                text-align: center;
            ">

                <div style="
                    width: 65px;
                    height: 65px;
                    margin: 0 auto 20px;
                    background-color: #eef3ff;
                    border-radius: 50%;
                    line-height: 65px;
                    font-size: 30px;
                ">
                    🔐
                </div>

                <h2 style="
                    margin: 0 0 12px;
                    color: #172554;
                    font-size: 25px;
                ">
                    Verify Your Email
                </h2>

                <p style="
                    color: #64748b;
                    font-size: 15px;
                    line-height: 1.7;
                    margin-bottom: 25px;
                ">
                    Thank you for choosing Chat++!
                    Use the verification code below
                    to complete your verification.
                </p>


                <!-- OTP Box -->
                <div style="
                    padding: 22px 10px;
                    background-color: #f0f5ff;
                    border: 1px solid #dbe7ff;
                    border-radius: 14px;
                ">

                    <p style="
                        margin: 0 0 12px;
                        color: #64748b;
                        font-size: 12px;
                        font-weight: bold;
                        letter-spacing: 2px;
                    ">
                        YOUR VERIFICATION CODE
                    </p>

                    <div style="
                        color: #2563eb;
                        font-size: 38px;
                        font-weight: 800;
                        letter-spacing: 10px;
                    ">
                        {otp}
                    </div>

                </div>


                <p style="
                    margin: 25px 0 0;
                    color: #475569;
                    font-size: 14px;
                    line-height: 1.6;
                ">
                    This OTP will expire in
                    <strong style="color: #2563eb;">
                        5 minutes
                    </strong>.
                    Please do not share this code with anyone.
                </p>


                <div style="
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e2e8f0;
                ">

                    <p style="
                        color: #94a3b8;
                        font-size: 12px;
                        line-height: 1.6;
                    ">
                        If you did not request this verification code,
                        you can safely ignore this email.
                    </p>

                </div>

            </div>


            <!-- Footer -->
            <div style="
                padding: 20px;
                text-align: center;
                background-color: #f8faff;
            ">

                <p style="
                    margin: 0;
                    color: #2563eb;
                    font-size: 14px;
                    font-weight: bold;
                ">
                    Chat++ Security Team
                </p>

                <p style="
                    margin: 8px 0 0;
                    color: #94a3b8;
                    font-size: 11px;
                ">
                    © 2026 Chat++. All rights reserved.
                </p>

            </div>

        </div>

    </body>
    </html>
    """

    try:

        # Create Brevo email
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            sender={
                "name": "Chat++",
                "email": os.getenv("BREVO_SENDER_EMAIL")
            },
            to=[
                {
                    "email": receiver_email
                }
            ],
            subject="Your Chat++ Verification Code",
            html_content=html_content
        )

        # Send email using Brevo
        response = api_instance.send_transac_email(send_smtp_email)

        print("Email sent successfully!")
        print("Message ID:", response.message_id)

        # Return OTP so Flask can store it for verification
        return {
            "success": True,
            "otp": otp
        }

    except ApiException as e:

        print("Email sending failed:", e)

        return {
            "success": False,
            "otp": None
        }

    except Exception as e:

        print("Unexpected error:", e)

        return {
            "success": False,
            "otp": None
        }