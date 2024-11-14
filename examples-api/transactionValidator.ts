// src/transactionValidator.ts

import { TonApiClient } from "@ton-api/client";

/**
 * Интерфейс, описывающий детали транзакции.
 */
export interface TransactionDetail {
    hash: string;
    bounced: boolean;
    success: boolean;
    aborted?: boolean;
    // Добавьте другие необходимые поля при необходимости
}

/**
 * Рекурсивная функция для проверки всех транзакций и их дочерних транзакций.
 * @param transactionData - Объект транзакции для проверки.
 * @returns true, если все транзакции и их дочерние транзакции удовлетворяют условиям, иначе false.
 */
export function validateTransactions(transactionData: any): boolean {

    // Проверяем текущую транзакцию на условия
    if (transactionData.transaction.bounced) {
        console.log(`Транзакция ${transactionData.transaction.hash} была отклонена (bounced = true).`);
        return false;
    }

    if (!transactionData.transaction.success) {
        console.log(`Транзакция ${transactionData.transaction.hash} не успешна (success = false).`);
        return false;
    }

    // Если есть дочерние транзакции, проверяем их рекурсивно
    if (transactionData.children && transactionData.children.length > 0) {
        for (const child of transactionData.children) {
            if (!validateTransactions(child)) {
                // Если хотя бы одна дочерняя транзакция не соответствует условиям, возвращаем false
                return false;
            }
        }
    }

    // Все проверки пройдены
    return true;
}

/**
 * Функция для проверки статуса транзакции через TonAPI.
 * @param client - Экземпляр TonApiClient.
 * @param traceId - Идентификатор трассировки транзакции (messageHash).
 * @param interval - Интервал между проверками в миллисекундах.
 * @param maxWaitTime - Максимальное время ожидания в миллисекундах.
 * @returns Promise<boolean> - Результат проверки.
 */
export async function checkTransactionStatusTonApi(
    client: TonApiClient,
    traceId: string,
    interval: number = 5000,
    maxWaitTime: number = 120000
): Promise<boolean> {
    const startTime = Date.now();

    // Ждём 30 секунд перед первой проверкой
    await new Promise(resolve => setTimeout(resolve, 30000));

    while (Date.now() - startTime < maxWaitTime) {
        try {
            // Получаем трассировку транзакции из TonAPI
            const response = await client.traces.getTrace(traceId);

            // Проверяем все транзакции и их дочерние транзакции
            const allTransactionsValid = validateTransactions(response);

            if (allTransactionsValid) {
                console.log('Все транзакции успешно завершены без отклонений.');
                return true; // Эта строка фактически не будет выполнена, так как process.exit(0) завершает процесс
            } else {
                console.log('Транзакция не удовлетворяет условиям. Продолжаем проверку...');
                return false
            }
        } catch (error: any) {
            // Игнорируем ошибку "Invalid magic"
            if (error.message && error.message.includes('Invalid magic')) {
                console.log('Транзакция не найдена. Повторная попытка через несколько секунд...');
            } else {
                console.error('Ошибка при получении статуса транзакции:', error.message || error);
                return false;
            }
        }

        // Ждём заданный интервал перед следующей проверкой
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('Транзакция не была подтверждена в течение максимального времени ожидания.');
    return false;
}
