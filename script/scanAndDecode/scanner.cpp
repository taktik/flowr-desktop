#include <napi.h>

// Fonction qui retourne "Hello, World!"
Napi::String HelloWorld(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::String::New(env, "Hello, World!");
}

// Initialisation du module et export de la fonction
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("hello", Napi::Function::New(env, HelloWorld));
    return exports;
}

// Déclaration du module pour Node.js
NODE_API_MODULE(hello, Init);