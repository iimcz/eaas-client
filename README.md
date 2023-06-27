# EaaS client JavaScript library

## How to use EaaS custom elements

1. Import eaas-client:

```html
<script
    type="module"
    src="https://emulation-as-a-service.gitlab.io/eaas-client/webcomponent.js"
></script>
```

2. Include an `<eaas-environment>` element in your page:

```html
<eaas-environment
    id="example1"
    eaas-service="https://your-eaas-instance.example/emil/"
    environment-id="56a1936b-63f0-4c1d-9cbb-b0a813657a00"
    autoplay
    style="border: red solid 10px;"
>
    <strong>Please wait</strong> while the environment is being started ...
</eaas-environment>
```

By including the `autoplay` [boolean attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes#boolean_attributes), the environment will be started as soon as the page loads. Otherwise, you can have to start the environment yourself using JavaScript: `document.getElementById("example1").play()`.

In the element's content, you can include any placeholder elements of your own. They will be shown while EaaS is starting the environment, which might need some time.

You can style the `<eaas-environment>` element like any other element (i.e., using the `style` attribute or style sheets).

## How to import the library for direct use from JavaScript

`import { Client } from "./eaas-client.js";`
