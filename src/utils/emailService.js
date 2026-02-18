const nodemailer = require('nodemailer');
const config = require('../config/config');

const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: false, // true for 465, false for other ports
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

const sendEmail = async (to, subject, text, html) => {
    try {
        const info = await transporter.sendMail({
            from: config.email.user,
            to: to,
            subject: subject,
            text: text,
            html: html,
        });
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

const sendWelcomeEmail = async (email) => {
    const subject = "Warm Welcome from Shirish and it's team side";
    const body = `Hi,

My name is Shirish, I am the CEO of hekratech.pvt.lim.
This is an automated email, but if you reply it will go straight to me.

If you have any feedback or comments on our product I would love to hear it.
If you are considering using this website, please get in touch.
We would be happy to assist you.

Thanks,
Shirish Dwivedi
`;
    // Non-blocking call in controller, but here just await or promise
    return sendEmail(email, subject, body);
};

const sendOtpEmail = async (email, otp) => {
    const subject = "Your Verification Code - Hridika Jewels";
    const body = `Your verification code is: ${otp}\n\nThis code is valid for 10 minutes.`;
    return sendEmail(email, subject, body);
};

const sendResetOtpEmail = async (email, otp) => {
    const subject = "Password Reset Code - Hridika Jewels";
    const html = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #fafafa;">
            <h2 style="color: #18181b; font-size: 18px; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 24px;">Password Reset</h2>
            <p style="color: #71717a; font-size: 14px; line-height: 1.6;">Use the code below to reset your password. This code is valid for <strong>10 minutes</strong>.</p>
            <div style="background: #18181b; color: #fff; text-align: center; padding: 20px; font-size: 32px; letter-spacing: 0.5em; font-weight: bold; margin: 24px 0;">${otp}</div>
            <p style="color: #a1a1aa; font-size: 12px;">If you did not request this, please ignore this email.</p>
            <p style="color: #a1a1aa; font-size: 11px; margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 16px;">Hridika Jewels &copy; 2026</p>
        </div>
    `;
    const text = `Your password reset code is: ${otp}\n\nThis code is valid for 10 minutes. If you did not request this, please ignore this email.`;
    return sendEmail(email, subject, text, html);
};

module.exports = {
    sendEmail,
    sendWelcomeEmail,
    sendOtpEmail,
    sendResetOtpEmail
};
