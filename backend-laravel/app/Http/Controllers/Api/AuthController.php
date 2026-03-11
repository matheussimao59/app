<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AuthController
{
    public function login(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar login com Laravel Sanctum.',
            'email' => $request->input('email'),
        ], 501);
    }

    public function logout(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar logout da sessao atual.',
            'user_id' => $request->user()?->id,
        ], 501);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar retorno do usuario autenticado.',
            'user' => $request->user(),
        ], 501);
    }
}
