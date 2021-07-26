/*
 * Copyright (c) 2020 The Web eID Project
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import Action from "@web-eid/web-eid-library/models/Action";
import ProtocolInsecureError from "@web-eid/web-eid-library/errors/ProtocolInsecureError";
import UserTimeoutError from "@web-eid/web-eid-library/errors/UserTimeoutError";
import ServerTimeoutError from "@web-eid/web-eid-library/errors/ServerTimeoutError";
import OriginMismatchError from "@web-eid/web-eid-library/errors/OriginMismatchError";
import { serializeError } from "@web-eid/web-eid-library/utils/errorSerializer";

import NativeAppService, { NativeAppState } from "../services/NativeAppService";
import WebServerService from "../services/WebServerService";
import HttpResponse from "../../models/HttpResponse";
import TypedMap from "../../models/TypedMap";
import { pick, throwAfterTimeout, isSameOrigin } from "../../shared/utils";

export default async function sign(
  postPrepareSigningUrl: string,
  postFinalizeSigningUrl: string,
  headers: TypedMap<string>,
  userInteractionTimeout: number,
  serverRequestTimeout: number,
): Promise<object | void> {
  let webServerService: WebServerService | undefined;
  let nativeAppService: NativeAppService | undefined;

  try {
    if (!postPrepareSigningUrl.startsWith("https:")) {
      throw new ProtocolInsecureError(`HTTPS required for postPrepareSigningUrl ${postPrepareSigningUrl}`);
    }

    if (!postFinalizeSigningUrl.startsWith("https:")) {
      throw new ProtocolInsecureError(`HTTPS required for postFinalizeSigningUrl ${postFinalizeSigningUrl}`);
    }

    if (!isSameOrigin(postPrepareSigningUrl, postFinalizeSigningUrl)) {
      throw new OriginMismatchError();
    }

    webServerService = new WebServerService();
    nativeAppService = new NativeAppService();

    let nativeAppStatus = await nativeAppService.connect();

    console.log("Sign: connected to native", nativeAppStatus);

    const certificateResponse = await Promise.race([
      nativeAppService.send({
        command: "get-certificate",

        arguments: {
          "type":   "sign",
          "origin": (new URL(postPrepareSigningUrl)).origin,
        },
      }),

      throwAfterTimeout(userInteractionTimeout, new UserTimeoutError()),
    ]) as {
      certificate: string;
      error?: string;

      "supported-signature-algos": Array<{
        "crypto-algo":  string;
        "hash-algo":    string;
        "padding-algo": string;
      }>;
    };

    if (certificateResponse.error) {
      throw new Error(certificateResponse.error);
    } else if (!certificateResponse.certificate) {
      throw new Error("Missing signing certificate");
    }

    const { certificate } = certificateResponse;

    const supportedSignatureAlgorithms = certificateResponse["supported-signature-algos"].map((algorithmSet) => ({
      crypto:  algorithmSet["crypto-algo"],
      hash:    algorithmSet["hash-algo"],
      padding: algorithmSet["padding-algo"],
    }));

    const prepareDocumentResult = await Promise.race([
      webServerService.fetch(postPrepareSigningUrl, {
        method: "POST",

        headers: {
          ...headers,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({ certificate, supportedSignatureAlgorithms }),
      }),

      throwAfterTimeout(
        serverRequestTimeout,
        new ServerTimeoutError(`server failed to respond in time - POST ${postPrepareSigningUrl}`),
      ),
    ]) as HttpResponse<{ hash: string; algorithm: string }>;

    console.log("Sign: postPrepareSigningUrl fetched", prepareDocumentResult);

    console.log("Native app state", nativeAppService.state);

    if (nativeAppService.state === NativeAppState.CONNECTED) {
      nativeAppService.close();
    }

    nativeAppService = new NativeAppService();

    nativeAppStatus = await nativeAppService.connect();

    console.log("Sign: reconnected to native", nativeAppStatus);

    const docHash = prepareDocumentResult.body.hash;
    const signatureResponse = await Promise.race([
      nativeAppService.send({
        command: "sign",

        arguments: {
          "doc-hash":      docHash,
          "hash-algo":     prepareDocumentResult.body.algorithm,
          "origin":        (new URL(postPrepareSigningUrl)).origin,
          "user-eid-cert": certificate,
        },
      }),

      throwAfterTimeout(userInteractionTimeout, new UserTimeoutError()),
    // ]) as { signature: string; error: string };
    ]) as { signature: string; token: string; error: string };

    if (signatureResponse.error) {
      throw new Error(signatureResponse.error);
    } else if (!signatureResponse.signature) {

      throw new Error("Missing sign signature");
    }

    const { signature } = signatureResponse;
    const { token } = signatureResponse; //NEW for record posting
    console.log("Sign: user signature received from native app", signatureResponse);
    console.log("Sign: user signature received from native app", signature);
    console.log({
      body: JSON.stringify({
        ...prepareDocumentResult.body,
        signature,
      }),
    });
    const signatureVerifyResponse = await Promise.race([
      webServerService.fetch<any>(postFinalizeSigningUrl, {
        method: "POST",

        headers: {
          ...headers,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          ...prepareDocumentResult.body,
          signature,
        }),
      }),

      throwAfterTimeout(
        serverRequestTimeout,
        new ServerTimeoutError(`server failed to respond in time - POST ${postFinalizeSigningUrl}`),
      ),
    ]);

    console.log("Sign: signature accepted by the server", signatureVerifyResponse);

    //BEGIN modify record entry in eID server
    const recordUrl = "https://eidrecordserver.herokuapp.com/api/eidrecords"; //remote
    // const recordUrl = "https://173dbb3a209c.ngrok.io/api/eidrecords"; //local
    console.log("Modifying record entry in the server: " + recordUrl);
    // @ts-ignore
    console.log(token["auth-token"]);
    const recordResponse = await fetch(recordUrl, {
      method:  "PUT",
      headers: {
        "Content-Type": "application/json",
        // @ts-ignore
        "auth-token":   token,
        "signature":    signature,
      },
      redirect: "follow",
      body:     JSON.stringify({
        "status": "Sign SUCCESS",
      }),
    });

    if(recordResponse.status > 300)
      throw new Error("Failed to modify record entry " + JSON.stringify(recordResponse.body));

    //END modify record entry in eID server

    return {
      action: Action.SIGN_SUCCESS,

      response: {
        ...pick(signatureVerifyResponse, [
          "body",
          "headers",
          "ok",
          "redirected",
          "status",
          "statusText",
          "type",
          "url",
        ]),
      },
    };
  } catch (error) {
    console.error("Sign:", error);

    return {
      action: Action.SIGN_FAILURE,
      error:  serializeError(error),
    };
  } finally {
    if (nativeAppService) nativeAppService.close();
  }
}
