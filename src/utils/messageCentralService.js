const axios = require('axios');

const BASE_URL = 'https://cpaas.messagecentral.com';

const sendSmsOtp = async (phone, otp) => {
    const authToken = process.env.MESSAGE_CENTRAL_AUTH_TOKEN;

    if (!authToken) {
        console.error("MESSAGE_CENTRAL_AUTH_TOKEN missing in .env");
        return { success: false };
    }

    try {
        // Parse phone number
        let mobileNumber = phone.replace('+', '');
        let countryCode = '91';

        if (mobileNumber.length > 10 && mobileNumber.startsWith('91')) {
            mobileNumber = mobileNumber.substring(2);
        }

        const response = await axios.post(`${BASE_URL}/verification/v3/send`, {}, {
            params: {
                countryCode,
                mobileNumber,
                flowType: 'SMS',
                otpLength: 4
            },
            headers: {
                'authToken': authToken
            }
        });

        if (response.data && response.data.responseCode === 200) {
            return { success: true, verificationId: response.data.data.verificationId };
        } else {
            console.error("MC Send Error:", response.data);
            return { success: false };
        }
    } catch (error) {
        // Handle 506: Request Already Exists - Reuse verificationId
        if (error.response?.data?.responseCode == 506) {
            return { success: true, verificationId: error.response.data.data.verificationId };
        }

        console.error("MC Send Error:", error.response?.data || error.message);
        return { success: false, error: error.message };
    }
};

const verifySmsOtp = async (verificationId, code, phone = "") => {
    const authToken = process.env.MESSAGE_CENTRAL_AUTH_TOKEN;

    if (!verificationId || !code) return { success: false };

    // Parse phone number
    let mobileNumber = phone.replace('+', '');
    let countryCode = '91';
    if (mobileNumber.length > 10 && mobileNumber.startsWith('91')) {
        mobileNumber = mobileNumber.substring(2);
    }


    try {
        const response = await axios.get(`${BASE_URL}/verification/v3/validateOtp`, {
            params: {
                countryCode: '91',
                mobileNumber: mobileNumber,
                verificationId: verificationId,
                code: code
            },
            headers: {
                'authToken': authToken
            }
        });


        if (response.data && response.data.responseCode === 200) {
            return { success: true };
        } else {
            return { success: false };
        }
    } catch (error) {
        console.error('MC Verify Error:', error.response?.data || error.message);
        return { success: false };
    }
};

module.exports = {
    sendSmsOtp,
    verifySmsOtp
};
