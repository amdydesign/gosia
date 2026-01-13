<?php
/**
 * Response Helper
 * Standardized JSON responses
 */

class Response
{
    /**
     * Send success response
     */
    public static function success($data = null, $message = 'Success', $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        $response = [
            'success' => true,
            'message' => $message
        ];

        if ($data !== null) {
            $response['data'] = $data;
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Send error response
     */
    public static function error($message = 'Error', $statusCode = 400, $errors = null)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        $response = [
            'success' => false,
            'message' => $message
        ];

        if ($errors !== null) {
            $response['errors'] = $errors;
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Send unauthorized response
     */
    public static function unauthorized($message = 'Unauthorized')
    {
        self::error($message, 401);
    }

    /**
     * Send not found response
     */
    public static function notFound($message = 'Not found')
    {
        self::error($message, 404);
    }

    /**
     * Send validation error
     */
    public static function validationError($errors)
    {
        self::error('Validation failed', 422, $errors);
    }
}
