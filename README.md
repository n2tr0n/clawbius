
```
  _____ _                 _     _
 / ____| |               | |   (_)
| |    | | __ ___      __| |__  _ _   _ ___
| |    | |/ _` \ \ /\ / /| '_ \| | | | / __|
| |____| | (_| |\ V  V / | |_) | | |_| \__ \
 \_____|_|\__,_| \_/\_/  |_.__/|_|\__,_|___/

```
# Clawbius

Clawbius is a fork of the venerable Moebius ANSI Art editor. This fork contains a local API for interoperability with 'ANSIClaw' - an Openclaw skill that allows an Openclaw AI agent to draw ANSI art directly via the API. This project is experimental. The author of this project does not recommend using Clawbius as a general ANSI editor. It should only be used in conjunction with Openclaw and ANSIClaw and is not intended to be a replacement for Moebius.

Clawbius currently is in a early development state, and is not distributed with binaries. You can compile it yourself or run it uncompiled using the instructions found below provided you have the appropriate versions of node and electron installed for your environment. It has been tested on Windows 11 and MacOS Sequoia.

This project has not been endorsed by the creators of Moebius in any way.

* [Openclaw](https://github.com/openclaw/openclaw)
* [ANSIClaw Skill Clawhub page](https://TBD.notyet)
* [ANSIClaw Skill Project](https://github.com/n2tr0n/ansiclaw)


# Clawbius API Details:

* [Human readable API (Swagger UI)](http://127.0.0.1:7777/api/docs)
* [Machine readable API (OpenAPI JSON)](http://127.0.0.1:7777/api/openapi.json)

# About Moebius, the source project

Moebius is an popular ANSI Editor for MacOS, Linux and Windows, designed and written by Andy Herbert and released under the Apache 2.0 license.

* [Moebius](https://blocktronics.github.io/moebius/)
* [Moebius Github](https://github.com/blocktronics/moebius)

## Using without compiling

On MacOS run `./node_modules/.bin/electron . --disable-gpu-sandbox 2>/dev/null` to launch Clawbius
Click 'New' to bring up the canvas; you must run Clawbius from a blank canvas, not the splash screen
Now you can ask Openclaw to use ANSIClaw to test the API or draw a picture

## Installation & building
```
git clone git@github.com/n2tr0n/clawbius.git
npm install
npm start
```

Clawbius packages can be built easily with [electron-builder](https://github.com/electron-userland/electron-builder). Note that a build for MacOS must be made on MacOS.

```
npm run-script build-mac
npm run-script build-win
npm run-script build-linux
```

## Clawbius Server
Clawbius features collaboration by multiple users on the same canvas through a server instance. Users connect to a server which allows them to draw and chat. The server will also create hourly backups. The server serves no purpose when used with the ANSIClaw skill and may be removed in future versions of Clawbius but remains an available feature for now. Documentation about this feature has been removed but can be found on the original Moebius project page.

## Acknowledgements
* Andy Herbert for the creation of Moebius, and all other contributors to that project
* Uses modified Google's Material Icons. https://material.io/icons/
* Included fonts:
  * Topaz originally appeared in Amiga Workbench, courtesy of Commodore Int.
  * P0t-NOoDLE appears courtesy of Leo 'Nudel' Davidson
  * mO'sOul appears courtesy of Desoto/Mo'Soul

## License
* Clawbius is copyright 2026 Paul Lopez
* Moebius is copyright 2022 Andy Herbert

Clawbius is licensed under the [Apache License, version 2.0](https://github.com/n2tr0n/clawbius/blob/main/LICENSE)

## Additional Links
* SAUCE: [http://www.acid.org/info/sauce/sauce.htm](http://www.acid.org/info/sauce/sauce.htm)
