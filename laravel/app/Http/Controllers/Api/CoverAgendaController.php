<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CoverAgendaController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar listagem de capas de agenda.',
            'filters' => $request->query(),
        ], 501);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar upload de capa frente e verso.',
            'payload' => $request->all(),
        ], 501);
    }

    public function show(string $cover): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar detalhe de capa.',
            'id' => $cover,
        ], 501);
    }

    public function update(Request $request, string $cover): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar atualizacao de capa.',
            'id' => $cover,
            'payload' => $request->all(),
        ], 501);
    }

    public function destroy(string $cover): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar exclusao de capa.',
            'id' => $cover,
        ], 501);
    }

    public function markPrinted(Request $request, string $cover): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar marcacao de impresso.',
            'id' => $cover,
            'payload' => $request->all(),
        ], 501);
    }
}
