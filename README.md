# Marco Antonio Hurtado Bandrés <br/> Trabajo Fin de Grado 2021 <br/> Final Year Dissertation

![logo etsii uma](https://www.uma.es/etsi-informatica/navegador_de_ficheros/Informatica/descargar/Logos/COLOR_FONDOBLANCO_INFORMATICA.png)

# Web eid webextension modified
This is one of the components developed/modified for my final year dissertation, which is a modification of the original 
[web-eid-webextension](https://github.com/web-eid/web-eid-webextension).

## Table of contents
* [Introduction](#introduction)
* [Modifications](#modifications)
* [Requirements](#requirements)
* [Setup](#setup)
* [Configuration](#configuration)

## Introduction

This extension works almost the same way as the [Web eid extension](https://github.com/web-eid/web-eid-webextension), with some minor changes.

Note that this modification is part of a **proof of concept**, therefore, some things may cause errors or be missing, but it has been tested with the rest of the components, and they work well. The components of this project are:
* The **modified native application**, developed in Python, which works kind of the same way as the original C++ native application, but using eID certificate files instead of eID smart cards. It also adds the functionality of storing eID usage records in local json files as well as the signed metadata, and sending the record posts to the eID record server to store them remotely.
* The [**modified spring boot example**](https://webeidspringexsamplemodified.herokuapp.com/), only modified to accept spanish AC-FNMT Usuarios and seg-social ACGISS eID certificates.
* This **modified Web eID extension**, only modified to fit the new structure with the record server added.
* The [**eID record server**](https://eidrecordserver.herokuapp.com): a new web application made from the original Web eID spring boot example which will track all the activity made with eID certificates and allows users to see a list of usages, download them and receive email notifications when their certificates are used. This component has been developed to add secure digital signature delegation.


## Modifications
This component has really little modifications, because one of the goals of this proof of concept
was to show that it was possible to keep and add functionality without having to change too many things. 
The main features added, and the changes made have been mainly done to fit the new signing process and for making the 
 eID certificate files delegation process more secure instead of eID cards, because  eID cards in a personal context are rarely delegated. Certificate files are the things being delegated normally.

Changes made:
1. In both [sign](src/background/actions/authenticate.ts) and [authenticate](src/background/actions/sign.ts) actions, sending a PUT request
   to the [eID record server](https://eidrecordserver.herokuapp.com/) to modify the record entry previously 
   created by the native app and registrered in the server.
2. In the [sign](src/background/actions/authenticate.ts) action, the *signatureResponse* variable also stores the token generated
   by the native app, wich will be used to authenticate the PUT request in the eID record server.

## Requirements
In order to make the extension work, you just need the following.

### Node and npm
This has been tested with Node v12.19.0 and Npm 6.14.8, but the majority of versions should work.<br/>
**Note:** in some linux versions, apt will install an older version of npm and node. To update to the latest, visit 
[this page](https://askubuntu.com/questions/426750/how-can-i-update-my-nodejs-to-the-latest-version).
### Browser
This extension has only been tested and in **Firefox**.

## Setup
Taken from the original project

1. Install the latest LTS version of Node.js - [https://nodejs.org](https://nodejs.org)

2. Clone the project or unzip the files if you downloaded them.

**Note:** If in the following steps you can't install the dependencies or compile the extension successfully, there is a compiled version of the extension in the [dist](dist) folder.
However, it is not 100% guaranteed that it will work. Try to compile it first.

3. Install dependencies
    ```bash
    npm install
    ```

4. Build the project with zip packages
    ```bash
    npm run clean build package
    ```

   For reproducible builds, set the `SOURCE_DATE_EPOCH` environment variable.  
   See [https://reproducible-builds.org/docs/source-date-epoch](https://reproducible-builds.org/docs/source-date-epoch) for details.
    ```bash
    SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct) npm run clean build package
    ```

   Alternatively, for reproducible builds, the `SOURCE_DATE_EPOCH` value can be taken from the `SOURCE_DATE_EPOCH` file of a previous build.
    ```bash
    SOURCE_DATE_EPOCH=$(cat ../previous-build/dist/firefox/SOURCE_DATE_EPOCH) npm run clean build package
    ```

5. Load in Firefox as a Temporary Extension
  1. Open [about:debugging#/runtime/this-firefox](about:debugging#/runtime/this-firefox)
  2. Click "Load temporary Add-on..." and open `/web-eid-webextension/dist/manifest.json`

### Configuration

Make sure the `NATIVE_APP_NAME` value in `src/config.ts` matches the one in
the native application manifest file (`/app/webeidPython.json` in the native app project).
