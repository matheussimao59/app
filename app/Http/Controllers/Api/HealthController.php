<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;

final class HealthController
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'service' => 'unica-print-api',
            'date' => now()->toIso8601String(),
        ]);
    }
}
