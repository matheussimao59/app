<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ShippingOrderController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar listagem de pedidos de envio.',
            'filters' => $request->query(),
        ], 501);
    }

    public function import(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar importacao com upsert por import_key.',
            'user_id' => $request->user()?->id,
        ], 501);
    }

    public function scan(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar busca de pedido por rastreio ou numero.',
            'query' => $request->query(),
        ], 501);
    }

    public function destroyByDate(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar exclusao por data de envio.',
            'payload' => $request->all(),
        ], 501);
    }
}
