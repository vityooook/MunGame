import axios from 'axios';

/**
 * Интерфейс для ответа TonCenter.
 */
interface TonCenterResponse {
    actions: {
        success: boolean;
        details?: any; // Дополнительные детали, если нужны
    }[];
}

/**
 * Проверяет успешность транзакции через TonCenter API.
 * @param account - Адрес аккаунта.
 * @param msgHash - Хэш сообщения.
 * @param apiKey - API-ключ для авторизации.
 * @param interval - Интервал между проверками в миллисекундах.
 * @param maxWaitTime - Максимальное время ожидания в миллисекундах.
 * @returns Promise<boolean> - Успешность транзакции.
 */
export async function checkTransactionStatusTonCenter(
    account: string,
    msgHash: string,
    apiKey: string | undefined,
    interval: number = 5000,
    maxWaitTime: number = 120000,
): Promise<boolean> {
    const baseUrl = 'https://testnet.toncenter.com/api/v3/actions';
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        try {
            const url = `${baseUrl}?account=${account}&msg_hash=${msgHash}`;
            const response = await axios.get<TonCenterResponse>(url, {
                headers: {
                    Authorization: `Bearer ${apiKey}`, // Добавляем API-ключ в заголовок
                },
            });

            const actions = response.data.actions;

            if (actions.length === 0) {
                console.log('Транзакция не найдена. Продолжаем проверку...');
            } else {
                const action = actions[0]; // Предполагается, что нас интересует первый элемент
                if (action.success) {
                    return true;
                } else {
                    return false;
                }
            }
        } catch (error: any) {
            console.error('Ошибка при запросе к TonCenter:', error.message || error);
            return false;
        }

        // Ждем перед следующей проверкой
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('Транзакция не была подтверждена в течение максимального времени ожидания.');
    return false;
}
