<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

final class AuthController
{
    public function register(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Dados invalidos para cadastro.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = User::query()->create([
            'name' => $request->string('name')->toString(),
            'email' => $request->string('email')->toString(),
            'password' => $request->string('password')->toString(),
            'role' => 'admin',
            'is_active' => 1,
        ]);

        $token = $user->createToken('frontend')->plainTextToken;

        return response()->json([
            'message' => 'Conta criada com sucesso.',
            'token' => $token,
            'user' => $this->mapUser($user),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Dados de login invalidos.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $user = User::query()->where('email', $request->string('email')->toString())->first();

        if (!$user || !$user->is_active || !Hash::check($request->string('password')->toString(), $user->password)) {
            return response()->json([
                'message' => 'E-mail ou senha invalidos.',
            ], 401);
        }

        $token = $user->createToken('frontend')->plainTextToken;

        return response()->json([
            'message' => 'Login realizado com sucesso.',
            'token' => $token,
            'user' => $this->mapUser($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Sessao encerrada com sucesso.',
            'user_id' => $request->user()?->id,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $user ? $this->mapUser($user) : null,
        ]);
    }

    private function mapUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
        ];
    }
}
