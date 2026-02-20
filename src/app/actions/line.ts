'use server';

export async function sendLineFlexMessageAction(token: string, to: string, message: any) {
    if (!token || !to) {
        return { success: false, error: 'Missing token or target ID' };
    }

    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                to: to,
                messages: [message]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Line API Error:', errorText);
            return { success: false, error: `Line API Error: ${response.status} ${response.statusText}` };
        }

        return { success: true };
    } catch (error: any) {
        console.error('Server Action Error:', error);
        return { success: false, error: error.message };
    }
}
